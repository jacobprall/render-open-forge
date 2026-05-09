/**
 * Server-side helper for proxying requests from the Next.js app to the gateway.
 * Uses GATEWAY_INTERNAL_URL + GATEWAY_API_SECRET for service-to-service auth.
 */

const GATEWAY_URL = process.env.GATEWAY_INTERNAL_URL || "http://localhost:4100";
const GATEWAY_SECRET = process.env.GATEWAY_API_SECRET || "";

export async function gatewayFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${GATEWAY_URL}/api${path}`;
  const headers = new Headers(init?.headers);
  if (GATEWAY_SECRET) {
    headers.set("Authorization", `Bearer ${GATEWAY_SECRET}`);
  }
  headers.set("Accept", "application/json");

  return fetch(url, { ...init, headers });
}
