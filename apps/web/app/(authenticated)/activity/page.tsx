import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ciEvents, agentRuns, sessions } from "@openforge/db/schema";
import { desc, eq } from "drizzle-orm";
import { relativeTime } from "@/lib/utils";
import { CirclePlay, Bot, Terminal } from "lucide-react";
import { PageShell, StatusBadge, EmptyState, ListRow } from "@/components/primitives";

export const metadata: Metadata = { title: "Activity" };

interface ActivityItem {
  id: string;
  type: "ci" | "agent" | "session";
  description: string;
  status?: string;
  createdAt: Date;
  link?: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  ci: <CirclePlay className="h-4 w-4" />,
  agent: <Bot className="h-4 w-4" />,
  session: <Terminal className="h-4 w-4" />,
};

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

  return (
    <PageShell title="Activity" narrow>
      {display.length === 0 ? (
        <EmptyState
          icon={<CirclePlay className="h-5 w-5" />}
          title="No recent activity"
          description="Your CI events, agent runs, and sessions will appear here."
        />
      ) : (
        <div className="space-y-2">
          {display.map((item) => (
            <ListRow
              key={item.id}
              href={item.link}
              icon={typeIcons[item.type]}
              title={item.description}
              meta={item.status ? <StatusBadge status={item.status} /> : undefined}
              trailing={
                <span className="text-xs text-text-tertiary">
                  {relativeTime(item.createdAt)}
                </span>
              }
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
