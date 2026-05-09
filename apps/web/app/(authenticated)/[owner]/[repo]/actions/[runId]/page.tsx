import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ciEvents } from "@openforge/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";
import { JobLogsPoller } from "@/components/actions/job-log-poller";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/10 text-warning border-amber-500/20",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  success: "bg-accent-bg text-accent-text border-accent/20",
  failure: "bg-danger/10 text-danger border-danger/20",
  error: "bg-danger/10 text-danger border-danger/20",
};

export default async function CIRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string; runId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const [session, resolvedParams, resolvedSearch] = await Promise.all([
    getSession(),
    params,
    searchParams,
  ]);
  if (!session) redirect("/");

  const { owner, repo, runId } = resolvedParams;
  const { job: jobLogsJobId } = resolvedSearch;
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
            <p className="mt-2 text-sm text-text-tertiary">
              This CI run doesn&apos;t exist or has been deleted.
            </p>
            <Link
              href={`/${owner}/${repo}/actions`}
              className="mt-4 inline-block text-sm text-accent-text hover:text-accent"
            >
              Back to Actions
            </Link>
          </div>
        </div>
      );
    }

    return <RunDetail owner={owner} repo={repo} event={eventByRunId} jobLogsJobId={jobLogsJobId} />;
  }

  return <RunDetail owner={owner} repo={repo} event={event} jobLogsJobId={jobLogsJobId} />;
}

function RunDetail({
  owner,
  repo,
  event,
  jobLogsJobId,
}: {
  owner: string;
  repo: string;
  event: typeof ciEvents.$inferSelect;
  jobLogsJobId?: string;
}) {
  const payload = event.payload as Record<string, unknown> | null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href={`/${owner}/${repo}/actions`}
          className="text-sm text-text-tertiary hover:text-text-primary"
        >
          ← Back to Actions
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {event.workflowName ?? "Workflow Run"}
          </h2>
          <p className="mt-1 text-sm text-text-tertiary">
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
        <div className="border border-stroke-subtle p-3">
          <p className="text-xs text-text-tertiary">Type</p>
          <p className="mt-1 text-sm font-medium">{event.type}</p>
        </div>
        <div className="border border-stroke-subtle p-3">
          <p className="text-xs text-text-tertiary">Triggered</p>
          <p className="mt-1 text-sm font-medium">
            {relativeTime(event.createdAt)}
          </p>
        </div>
        <div className="border border-stroke-subtle p-3">
          <p className="text-xs text-text-tertiary">Session</p>
          <p className="mt-1 text-sm font-medium">
            <Link
              href={`/sessions/${event.sessionId}`}
              className="text-accent-text hover:text-accent"
            >
              {event.sessionId.slice(0, 8)}...
            </Link>
          </p>
        </div>
        {event.logsUrl && (
          <div className="border border-stroke-subtle p-3">
            <p className="text-xs text-text-tertiary">Logs</p>
            <p className="mt-1 text-sm">
              <a
                href={event.logsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text hover:text-accent"
              >
                View run details ↗
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-text-tertiary">
          Output / Logs
        </h3>
        <p className="mb-2 text-xs text-text-tertiary">
          For live plaintext job logs here, open this page with{" "}
          <code className="bg-surface-0 px-1 text-text-secondary">?job=FORGEJO_JOB_ID</code> in the URL (from the
          Actions UI).
        </p>
        {jobLogsJobId ? (
          <JobLogsPoller owner={owner} repo={repo} jobId={jobLogsJobId} />
        ) : (
          <div className="border border-stroke-subtle bg-surface-1 p-4">
            {payload ? (
              <pre className="overflow-auto font-mono text-xs text-text-secondary">
                {JSON.stringify(payload, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-text-tertiary">
                No log output available for this run.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
