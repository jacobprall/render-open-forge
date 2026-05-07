import { NextRequest, NextResponse } from "next/server";
import { encodeSession, getSessionCookieName } from "@/lib/auth/session";

/**
 * OAuth2 callback from Forgejo.
 * Exchanges the authorization code for an access token, then fetches user info.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || state !== storedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "No authorization code" }, { status: 400 });
  }

  const forgejoUrl = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
  const clientId = process.env.FORGEJO_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.FORGEJO_OAUTH_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"}/api/auth/callback`;

  const tokenRes = await fetch(`${forgejoUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return NextResponse.json(
      { error: "Token exchange failed", detail: body },
      { status: 502 },
    );
  }

  const tokenData = await tokenRes.json() as { access_token: string; token_type: string };
  const accessToken = tokenData.access_token;

  const userRes = await fetch(`${forgejoUrl}/api/v1/user`, {
    headers: { Authorization: `token ${accessToken}` },
  });

  if (!userRes.ok) {
    return NextResponse.json({ error: "Failed to fetch user info" }, { status: 502 });
  }

  const user = await userRes.json() as {
    id: number;
    login: string;
    email: string;
    avatar_url: string;
  };

  const session = encodeSession({
    forgejoToken: accessToken,
    userId: user.id,
    username: user.login,
    email: user.email,
    avatarUrl: user.avatar_url,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
  const response = NextResponse.redirect(`${appUrl}/repos`);

  response.cookies.set(getSessionCookieName(), session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  response.cookies.delete("oauth_state");

  return response;
}
