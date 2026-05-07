export function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getRequestIdFromHeaders(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (k: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(k) ?? undefined;
    }
    const v = headers[k.toLowerCase()] ?? headers[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };
  return get("x-request-id") ?? generateRequestId();
}
