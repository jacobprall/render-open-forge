import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats } from "@render-open-forge/db";
import { eq, and, desc } from "drizzle-orm";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(userSession.userId))))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const [chatRow] = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, id))
    .orderBy(desc(chats.createdAt))
    .limit(1);

  const runId = chatRow?.activeRunId;
  if (!runId) {
    return NextResponse.json({ error: "No active run" }, { status: 400 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const redis = createRedisClient("stop-run");
  try {
    await redis.set(`run:${runId}:abort`, "1", "EX", 3600);
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ success: true, runId });
}
