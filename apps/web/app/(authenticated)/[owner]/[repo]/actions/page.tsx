import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ciEvents, sessions } from "@openforge/db";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/10 text-warning border-amber-500/20",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  success: "bg-accent-bg text-accent-text border-accent/20",
  failure: "bg-danger/10 text-danger border-danger/20",
  error: "bg-danger/10 text-danger border-danger/20",
};

export default async function ActionsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo } = await params;
  const repoPath = `${owner}/${repo}`;
  const db = getDb();

  const repoSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.repoPath, repoPath));

  const sessionIds = repoSessions.map((s) => s.id);

  let events: (typeof ciEvents.$inferSelect)[] = [];
  if (sessionIds.length > 0) {
    const allEvents = await Promise.all(
      sessionIds.map((sid) =>
        db
          .select()
          .from(ciEvents)
          .where(eq(ciEvents.sessionId, sid))
          .orderBy(desc(ciEvents.createdAt))
      )
    );
    events = allEvents
      .flat()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">CI / Actions</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Workflow runs triggered by CI actions
        </p>
      </div>

      {events.length === 0 ? (
        <div className="border border-stroke-subtle p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <svg className="h-6 w-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          </div>
          <p className="text-text-tertiary">No workflow runs yet</p>
          <p className="mt-1 text-sm text-text-tertiary">
            Push commits or open pull requests to trigger CI workflows
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border border-stroke-subtle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stroke-subtle bg-surface-1">
                <th className="px-4 py-3 text-left font-medium text-text-tertiary">
                  Workflow
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-tertiary">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-text-tertiary">
                  Type
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-tertiary">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {events.map((event) => (
                <tr key={event.id} className="transition-colors duration-(--of-duration-instant) hover:bg-surface-1">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${owner}/${repo}/actions/${event.runId ?? event.id}`}
                      className="font-medium text-text-primary hover:text-accent-text"
                    >
                      {event.workflowName ?? "Workflow"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[event.status ?? "pending"]}`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">{event.type}</td>
                  <td className="px-4 py-3 text-right text-text-tertiary">
                    {relativeTime(event.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
