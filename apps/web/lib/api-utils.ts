export async function safeJson<T = unknown>(req: Request): Promise<{ data: T } | { error: string }> {
  try {
    const data = await req.json();
    return { data };
  } catch {
    return { error: "Invalid JSON in request body" };
  }
}
