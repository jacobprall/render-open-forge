import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const STREAM_PATHS = ["/api/chat", "/api/agent/stream"];

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `rl:${ip}`;
}

function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - entry.count,
    resetAt: entry.resetAt,
  };
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply rate limiting to API routes (skip stream endpoints)
  if (pathname.startsWith("/api/")) {
    const isStream = STREAM_PATHS.some((p) => pathname.startsWith(p));
    if (!isStream) {
      const key = getRateLimitKey(request);
      const result = checkRateLimit(key);

      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(
                Math.ceil(result.resetAt / 1000),
              ),
              "Retry-After": String(
                Math.ceil((result.resetAt - Date.now()) / 1000),
              ),
            },
          },
        );
      }

      const response = NextResponse.next();
      response.headers.set(
        "X-RateLimit-Remaining",
        String(result.remaining),
      );
      response.headers.set(
        "X-RateLimit-Reset",
        String(Math.ceil(result.resetAt / 1000)),
      );
      return response;
    }
  }

  // CSRF validation for mutating non-API routes
  const method = request.method;
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    !pathname.startsWith("/api/")
  ) {
    const csrfToken = request.headers.get("x-csrf-token");
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && host && !origin.includes(host)) {
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 },
      );
    }

    if (!csrfToken && !origin) {
      return NextResponse.json(
        { error: "CSRF token required" },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
