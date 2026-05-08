import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRateLimit,
  getRateLimitHeaders,
  type RateLimitResult,
} from "@/lib/auth/rate-limit";

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const STREAM_PATHS = ["/api/chat", "/api/agent/stream"];

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `rl:${ip}`;
}

function requiresApiCsrfProtection(pathname: string, method: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return false;
  }
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (pathname.startsWith("/api/webhooks/")) {
    return false;
  }
  if (pathname.startsWith("/api/auth/")) {
    return false;
  }
  return true;
}

function originMatchesHost(origin: string | null, host: string | null): boolean {
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function passesApiCsrfProtection(request: NextRequest): boolean {
  if (request.headers.has("x-requested-with")) {
    return true;
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return originMatchesHost(origin, host);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  let rateLimitPassed: RateLimitResult | null = null;

  if (pathname.startsWith("/api/")) {
    const isStream = STREAM_PATHS.some((p) => pathname.startsWith(p));
    if (!isStream) {
      const key = getRateLimitKey(request);
      const result = checkRateLimit(
        key,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS,
      );

      if (!result.allowed) {
        const rlHeaders = getRateLimitHeaders(result);
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              ...rlHeaders,
              "Retry-After": String(
                Math.ceil((result.resetAt - Date.now()) / 1000),
              ),
            },
          },
        );
      }
      rateLimitPassed = result;
    }

    if (requiresApiCsrfProtection(pathname, method)) {
      if (!passesApiCsrfProtection(request)) {
        return NextResponse.json(
          { error: "CSRF validation failed" },
          { status: 403 },
        );
      }
    }
  }

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

  const response = NextResponse.next();
  if (rateLimitPassed) {
    const rlHeaders = getRateLimitHeaders(rateLimitPassed);
    for (const [k, v] of Object.entries(rlHeaders)) {
      response.headers.set(k, v);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
