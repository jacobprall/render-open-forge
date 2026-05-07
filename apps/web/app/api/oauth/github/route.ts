import crypto from "node:crypto";
import { NextResponse } from "next/server";

const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
const oauthScopes = ["read:user", "repo"];

export async function GET(req: Request) {
  if (!clientId) {
    return NextResponse.json({ error: "GITHUB_OAUTH_CLIENT_ID not configured" }, { status: 503 });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/oauth/github/callback`;

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", oauthScopes.join(" "));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("gh_oauth_state", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure,
  });

  return res;
}
