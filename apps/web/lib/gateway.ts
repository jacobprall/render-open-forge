/**
 * Server-side helpers for proxying requests from the Next.js app to the gateway.
 *
 * `gatewayFetch`    — low-level fetch with internal auth.
 * `gatewayProxy`    — high-level: forward a NextRequest and return a NextResponse.
 * `gatewayStream`   — proxy an SSE stream from the gateway to the browser.
 * `requireUserId`   — resolve NextAuth session to a userId (throws 401 Response).
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const GATEWAY_URL = process.env.GATEWAY_INTERNAL_URL || "http://localhost:4100";
const GATEWAY_SECRET = process.env.GATEWAY_API_SECRET || "";

// ── Low-level fetch ─────────────────────────────────────────────────────────

export interface GatewayFetchOptions extends Omit<RequestInit, "headers"> {
  userId?: string;
  headers?: HeadersInit;
}

export async function gatewayFetch(
  path: string,
  opts: GatewayFetchOptions = {},
): Promise<Response> {
  const { userId, headers: extraHeaders, ...init } = opts;
  const url = `${GATEWAY_URL}/api${path}`;
  const headers = new Headers(extraHeaders);

  if (GATEWAY_SECRET) {
    headers.set("Authorization", `Bearer ${GATEWAY_SECRET}`);
  }
  if (userId) {
    headers.set("X-OpenForge-User-Id", userId);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return fetch(url, { ...init, headers });
}

// ── High-level proxy (NextRequest → NextResponse) ───────────────────────────

export async function gatewayProxy(
  req: NextRequest,
  gatewayPath: string,
  userId: string,
): Promise<NextResponse> {
  const body = hasBody(req.method)
    ? await req.text()
    : undefined;

  const contentType = req.headers.get("Content-Type");
  const fwdHeaders: Record<string, string> = {};
  if (contentType) fwdHeaders["Content-Type"] = contentType;

  const res = await gatewayFetch(gatewayPath, {
    method: req.method,
    body,
    userId,
    headers: fwdHeaders,
  });

  const responseBody = await res.text();

  return new NextResponse(responseBody, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}

// ── SSE stream proxy ────────────────────────────────────────────────────────

export async function gatewayStream(
  gatewayPath: string,
  userId: string,
): Promise<Response> {
  const res = await gatewayFetch(gatewayPath, {
    userId,
    headers: { Accept: "text/event-stream" },
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "Gateway stream error");
    return new Response(text, { status: res.status });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasBody(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH";
}

// ── Auth helper ─────────────────────────────────────────────────────────────

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session.user.id;
}
