import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, usageEvents } from "@render-open-forge/db";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_QUOTA } from "@/lib/orgs/quotas";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org: _org } = await params;
  const db = getDb();
  const userId = String(auth.userId);

  let totalTokens = 0;
  let activeSessions = 0;

  try {
    const tokenResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)`,
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId));
    totalTokens = Number(tokenResult[0]?.total ?? 0);
  } catch {
    // table may not exist yet
  }

  try {
    const sessionResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    activeSessions = Number(sessionResult[0]?.count ?? 0);
  } catch {
    // fallback
  }

  const quotas = [
    {
      label: "Model Tokens",
      used: totalTokens,
      limit: DEFAULT_QUOTA.maxModelTokens,
      unit: "tokens",
    },
    {
      label: "Sandbox Minutes",
      used: 0,
      limit: DEFAULT_QUOTA.maxSandboxMinutes,
      unit: "min",
    },
    {
      label: "Active Sessions",
      used: activeSessions,
      limit: DEFAULT_QUOTA.maxConcurrentSessions,
      unit: "sessions",
    },
    {
      label: "Storage",
      used: 0,
      limit: DEFAULT_QUOTA.maxStorageGB * 1024,
      unit: "MB",
    },
  ];

  return NextResponse.json({ quotas });
}
