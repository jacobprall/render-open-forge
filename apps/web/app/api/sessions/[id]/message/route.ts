import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats, chatMessages, agentRuns } from "@render-open-forge/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { enqueueJob, ensureConsumerGroup } from "@render-open-forge/shared";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";

export async function POST(
  req: NextRequest,
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

  const body = await req.json();
  const content = body.content;
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  let [chatRow] = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, id))
    .orderBy(desc(chats.createdAt))
    .limit(1);

  if (!chatRow) {
    const chatId = crypto.randomUUID();
    [chatRow] = await db
      .insert(chats)
      .values({
        id: chatId,
        sessionId: id,
        title: sessionRow.title,
      })
      .returning();
  }

  const messageId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  await db.insert(chatMessages).values({
    id: messageId,
    chatId: chatRow.id,
    role: "user",
    parts: [{ type: "text", text: content }],
  });

  await db.insert(agentRuns).values({
    id: runId,
    chatId: chatRow.id,
    sessionId: id,
    userId: String(userSession.userId),
    modelId: body.modelId ?? "anthropic/claude-sonnet-4-5",
    phase: sessionRow.phase ?? "execute",
    status: "queued",
    createdAt: new Date(),
  });

  await db
    .update(chats)
    .set({ activeRunId: runId, updatedAt: new Date() })
    .where(eq(chats.id, chatRow.id));

  await db
    .update(sessions)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.id, id));

  if (isRedisConfigured()) {
    const redis = createRedisClient("chat-enqueue");
    try {
      await ensureConsumerGroup(redis);

      const rows = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.chatId, chatRow.id))
        .orderBy(asc(chatMessages.createdAt));

      const messages = rows.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.parts,
      }));

      await enqueueJob(redis, {
        runId,
        chatId: chatRow.id,
        sessionId: id,
        userId: String(userSession.userId),
        messages,
        phase: sessionRow.phase ?? "execute",
        workflowMode: sessionRow.workflowMode ?? "standard",
        projectConfig: sessionRow.projectConfig,
        projectContext: sessionRow.projectContext,
        modelId: body.modelId ?? "anthropic/claude-sonnet-4-5",
        requestId,
        maxRetries: 3,
      });
    } finally {
      redis.disconnect();
    }
  } else {
    console.warn("[message] Redis not configured — agent job not enqueued");
  }

  return NextResponse.json({ success: true, messageId, runId });
}
