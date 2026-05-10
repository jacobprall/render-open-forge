/**
 * Shared client-side fetch wrapper for browser → Next.js API calls.
 *
 * Automatically handles:
 * - CSRF protection via `X-Requested-With` header
 * - JSON serialization of request bodies
 * - `Content-Type: application/json` when a body is present
 * - Consistent `{ ok, status, data }` response shape
 */

export interface ApiFetchResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function apiFetch<T = unknown>(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiFetchResult<T>> {
  const { method = "GET", body, headers = {} } = opts;

  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      "X-Requested-With": "fetch",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}) as T);
  return { ok: res.ok, status: res.status, data };
}
