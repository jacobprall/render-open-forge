import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Initiates OAuth2 flow with Forgejo.
 * Forgejo handles Google OAuth internally — we just redirect to Forgejo's authorize endpoint.
 */
export async function GET() {
  const forgejoUrl = process.env.FORGEJO_EXTERNAL_URL || "http://localhost:3000";
  const clientId = process.env.FORGEJO_OAUTH_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"}/api/auth/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "FORGEJO_OAUTH_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");

  const authorizeUrl = new URL(`${forgejoUrl}/login/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "read:user write:repository write:issue");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
  });

  return response;
}
