/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to initialize background services that should run for the
 * lifetime of the server process (cron jobs, connection pools, etc.).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMirrorCron } = await import("@/lib/sync/mirror-engine");
    const { getDb } = await import("@/lib/db");
    const { bootstrapAdminIfNeeded } = await import("@/lib/auth/bootstrap");

    try {
      const db = getDb();
      startMirrorCron(db);
    } catch {
      // DB may not be available yet (e.g., during build).
    }

    try {
      await bootstrapAdminIfNeeded();
    } catch (err) {
      console.warn("[bootstrap] Admin seed skipped:", err instanceof Error ? err.message : err);
    }
  }
}
