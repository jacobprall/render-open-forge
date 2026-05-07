import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ciEvents } from "@render-open-forge/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failure: "bg-red-500/10 text-red-400 border-red-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default async function CIRunDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; runId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo, runId } = await params;
  const db = getDb();

  const event = await db
    .select()
    .from(ciEvents)
    .where(eq(ciEvents.id, runId))
    .then((r) => r[0] ?? null);

  if (!event) {
    const eventByRunId = await db
      .select()
      .from(ciEvents)
      .where(eq(ciEvents.runId, runId))
      .then((r) => r[0] ?? null);

    if (!eventByRunId) {
      return (
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Run not found</h2>
            <p className="mt-2 text-sm text-zinc-400">
              This CI run doesn&apos;t exist or has been deleted.
            </p>
            <Link
              href={`/${owner}/${repo}/actions`}
              className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300"
            >
              Back to Actions
            </Link>
          </div>
        </div>
      );
    }

    return <RunDetail owner={owner} repo={repo} event={eventByRunId} />;
  }

  return <RunDetail owner={owner} repo={repo} event={event} />;
}

function RunDetail({
  owner,
  repo,
  event,
}: {
  owner: string;
  repo: string;
  event: typeof ciEvents.$inferSelect;
}) {
  const payload = event.payload as Record<string, unknown> | null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href={`/${owner}/${repo}/actions`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to Actions
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {event.workflowName ?? "Workflow Run"}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Run ID: {event.runId ?? event.id}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-sm font-medium ${statusStyles[event.status ?? "pending"]}`}
        >
          {event.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-xs text-zinc-500">Type</p>
          <p className="mt-1 text-sm font-medium">{event.type}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-xs text-zinc-500">Triggered</p>
          <p className="mt-1 text-sm font-medium">
            {relativeTime(event.createdAt)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-xs text-zinc-500">Session</p>
          <p className="mt-1 text-sm font-medium">
            <Link
              href={`/sessions/${event.sessionId}`}
              className="text-emerald-400 hover:text-emerald-300"
            >
              {event.sessionId.slice(0, 8)}...
            </Link>
          </p>
        </div>
        {event.logsUrl && (
          <div className="rounded-lg border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Logs</p>
            <p className="mt-1 text-sm">
              <a
                href={event.logsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                View in Forgejo ↗
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-zinc-400">
          Output / Logs
        </h3>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {payload ? (
            <pre className="overflow-auto font-mono text-xs text-zinc-300">
              {JSON.stringify(payload, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500">
              No log output available for this run.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
