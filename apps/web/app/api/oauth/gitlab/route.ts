import crypto from "node:crypto";
import { NextResponse } from "next/server";

const applicationId = process.env.GITLAB_APPLICATION_ID;
const gitlabUrl = (process.env.GITLAB_URL || "https://gitlab.com").replace(/\/$/, "");

function resolveOrigin(req: Request): string {
  const headers = new Headers(req.headers);
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  if (!applicationId) {
    return NextResponse.json(
      { error: "GITLAB_APPLICATION_ID not configured" },
      { status: 503 },
    );
  }

  const state = crypto.randomBytes(24).toString("hex");
  const origin = resolveOrigin(req);
  const redirectUri = `${origin}/api/oauth/gitlab/callback`;

  const url = new URL(`${gitlabUrl}/oauth/authorize`);
  url.searchParams.set("client_id", applicationId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "read_user api");

  const res = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("gl_oauth_state", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure,
  });

  return res;
}
