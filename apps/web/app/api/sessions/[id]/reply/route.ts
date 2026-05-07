import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { agentRuns, chats, sessions } from "@render-open-forge/db";
import { and, desc, eq } from "drizzle-orm";
import { askUserReplyQueueKey } from "@render-open-forge/shared";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";

/**
 * Reply to ask_user_question: RPUSH user's answer onto the Redis list the worker is blocking on.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, String(auth.userId))))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const body = await req.json();
  const toolCallId = typeof body.toolCallId === "string" ? body.toolCallId : null;
  const message = typeof body.message === "string" ? body.message : typeof body.answer === "string" ? body.answer : null;
  const runId = typeof body.runId === "string" ? body.runId : null;

  if (!toolCallId || !message?.trim()) {
    return NextResponse.json({ error: "toolCallId and message required" }, { status: 400 });
  }

  const [chatRow] = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, sessionId))
    .orderBy(desc(chats.createdAt))
    .limit(1);

  const effectiveRunId = runId ?? chatRow?.activeRunId;
  if (!effectiveRunId) {
    return NextResponse.json({ error: "No active agent run — cannot deliver reply" }, { status: 409 });
  }

  if (!runId) {
    const [run] = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.id, effectiveRunId), eq(agentRuns.sessionId, sessionId)))
      .limit(1);
    if (!run) {
      return NextResponse.json({ error: "Invalid run context" }, { status: 400 });
    }
  }

  const redis = createRedisClient("session-reply");
  try {
    const key = askUserReplyQueueKey(effectiveRunId, toolCallId);
    await redis.rpush(key, JSON.stringify({ message: message.trim() }));
  } finally {
    redis.disconnect();
  }

  return NextResponse.json({ success: true });
}
