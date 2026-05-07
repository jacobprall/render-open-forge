/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to initialize background services that should run for the
 * lifetime of the server process (cron jobs, connection pools, etc.).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only start background services on the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMirrorCron } = await import("@/lib/sync/mirror-engine");
    const { getDb } = await import("@/lib/db");

    try {
      const db = getDb();
      startMirrorCron(db);
    } catch {
      // DB may not be available yet (e.g., during build).
      // The cron will be started on the first request that initializes the DB.
    }
  }
}
