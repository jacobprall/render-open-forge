import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ciEvents, agentRuns, sessions } from "@render-open-forge/db/schema";
import { desc, eq, and } from "drizzle-orm";
import type { Notification } from "@/lib/notifications";
import { paginationSchema, paginatedResponse } from "@/lib/api/pagination";

/** Cap per-source fetch so merged unread pagination stays bounded. */
const NOTIFICATIONS_SOURCE_FETCH_CAP = 2000;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paginationParsed = paginationSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!paginationParsed.success) {
    return NextResponse.json(
      { error: "Invalid pagination", details: paginationParsed.error.flatten() },
      { status: 400 },
    );
  }
  const params = paginationParsed.data;

  const fetchSize = Math.min(
    NOTIFICATIONS_SOURCE_FETCH_CAP,
    params.offset + params.limit + 25,
  );

  const db = getDb();
  const userId = session.userId.toString();
  const notifications: Notification[] = [];

  const failedCi = await db
    .select()
    .from(ciEvents)
    .innerJoin(sessions, eq(ciEvents.sessionId, sessions.id))
    .where(and(eq(sessions.userId, userId), eq(ciEvents.type, "ci_failure")))
    .orderBy(desc(ciEvents.createdAt))
    .limit(fetchSize);

  for (const row of failedCi) {
    notifications.push({
      id: `ci-${row.ci_events.id}`,
      userId,
      type: "ci_failed",
      title: "CI Failed",
      body: `Workflow "${row.ci_events.workflowName || "build"}" failed`,
      link: `/sessions/${row.ci_events.sessionId}`,
      read: row.ci_events.processed,
      createdAt: row.ci_events.createdAt,
    });
  }

  const errorRuns = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.status, "error")))
    .orderBy(desc(agentRuns.createdAt))
    .limit(fetchSize);

  for (const run of errorRuns) {
    notifications.push({
      id: `run-${run.id}`,
      userId,
      type: "agent_needs_input",
      title: "Agent Error",
      body: `Agent run failed (${run.trigger || "manual"})`,
      link: `/sessions/${run.sessionId}`,
      read: false,
      createdAt: run.createdAt,
    });
  }

  notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const unread = notifications.filter((n) => !n.read);
  const window = unread.slice(params.offset, params.offset + params.limit + 1);
  const page = paginatedResponse(window, params);

  return NextResponse.json({
    notifications: page.data,
    data: page.data,
    pagination: page.pagination,
  });
}
