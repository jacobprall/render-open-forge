import { NextRequest, NextResponse } from "next/server";
import { encodeSession, getSessionCookieName } from "@/lib/auth/session";

/**
 * Dev-only login: authenticate with Forgejo username/password directly.
 * Creates an API token and sets the session cookie.
 */
export async function POST(request: NextRequest) {
  const { username, password } = (await request.json()) as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password required" }, { status: 400 });
  }

  const forgejoUrl = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
  const tokenName = `dev-session-${Date.now()}`;

  const tokenRes = await fetch(`${forgejoUrl}/api/v1/users/${username}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
    body: JSON.stringify({ name: tokenName, scopes: ["all"] }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return NextResponse.json(
      { error: "Authentication failed", detail: body },
      { status: 401 },
    );
  }

  const tokenData = (await tokenRes.json()) as { sha1: string };
  const accessToken = tokenData.sha1;

  const userRes = await fetch(`${forgejoUrl}/api/v1/user`, {
    headers: { Authorization: `token ${accessToken}` },
  });

  if (!userRes.ok) {
    return NextResponse.json({ error: "Failed to fetch user info" }, { status: 502 });
  }

  const user = (await userRes.json()) as {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4100";
  const response = NextResponse.json({ ok: true, redirect: `${appUrl}/repos` });

  response.cookies.set(getSessionCookieName(), session, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
