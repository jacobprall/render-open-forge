/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapAdminIfNeeded } = await import("@/lib/auth/bootstrap");

    try {
      await bootstrapAdminIfNeeded();
    } catch (err) {
      console.warn("[bootstrap] Admin seed skipped:", err instanceof Error ? err.message : err);
    }
  }
}
