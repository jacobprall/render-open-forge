import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ciEvents, agentRuns, sessions } from "@render-open-forge/db/schema";
import { desc, eq } from "drizzle-orm";
import { relativeTime } from "@/lib/utils";
import Link from "next/link";

export const metadata: Metadata = { title: "Activity" };

interface ActivityItem {
  id: string;
  type: "ci" | "agent" | "session";
  description: string;
  status?: string;
  createdAt: Date;
  link?: string;
}

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();

  const [recentCi, recentRuns, recentSessions] = await Promise.all([
    db
      .select()
      .from(ciEvents)
      .innerJoin(sessions, eq(ciEvents.sessionId, sessions.id))
      .where(eq(sessions.userId, session.userId.toString()))
      .orderBy(desc(ciEvents.createdAt))
      .limit(20),
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.userId, session.userId.toString()))
      .orderBy(desc(agentRuns.createdAt))
      .limit(20),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, session.userId.toString()))
      .orderBy(desc(sessions.createdAt))
      .limit(10),
  ]);

  const items: ActivityItem[] = [];

  for (const row of recentCi) {
    items.push({
      id: row.ci_events.id,
      type: "ci",
      description: `${row.ci_events.type}: ${row.ci_events.workflowName || "workflow"}`,
      status: row.ci_events.status ?? undefined,
      createdAt: row.ci_events.createdAt,
      link: `/sessions/${row.ci_events.sessionId}`,
    });
  }

  for (const run of recentRuns) {
    items.push({
      id: run.id,
      type: "agent",
      description: `Agent run (${run.trigger || "manual"})`,
      status: run.status,
      createdAt: run.createdAt,
      link: `/sessions/${run.sessionId}`,
    });
  }

  for (const s of recentSessions) {
    items.push({
      id: s.id,
      type: "session",
      description: s.title,
      status: s.status,
      createdAt: s.createdAt,
      link: `/sessions/${s.id}`,
    });
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const display = items.slice(0, 50);

  const typeIcons: Record<string, string> = {
    ci: "CI",
    agent: "AG",
    session: "SS",
  };

  const statusColors: Record<string, string> = {
    success: "text-emerald-400",
    completed: "text-emerald-400",
    running: "text-blue-400",
    failed: "text-red-400",
    error: "text-red-400",
    failure: "text-red-400",
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">Activity</h1>

      {display.length === 0 ? (
        <p className="text-sm text-zinc-400">No recent activity.</p>
      ) : (
        <div className="space-y-2">
          {display.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-[10px] font-bold text-zinc-400">
                {typeIcons[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                {item.link ? (
                  <Link
                    href={item.link}
                    className="truncate text-sm text-zinc-200 hover:text-emerald-400"
                  >
                    {item.description}
                  </Link>
                ) : (
                  <span className="truncate text-sm text-zinc-200">
                    {item.description}
                  </span>
                )}
              </div>
              {item.status && (
                <span
                  className={`text-xs font-medium ${statusColors[item.status] || "text-zinc-400"}`}
                >
                  {item.status}
                </span>
              )}
              <span className="shrink-0 text-xs text-zinc-500">
                {relativeTime(item.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
