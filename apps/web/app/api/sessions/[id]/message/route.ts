import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats, chatMessages, agentRuns } from "@render-open-forge/db";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { enqueueJob, ensureConsumerGroup } from "@render-open-forge/shared";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import { createForgeProvider } from "@/lib/forgejo/client";
import { resolveSkillsForSessionRow } from "@/lib/skills/resolve-for-session";

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

  // I4: Validate modelId if provided
  const requestedModelId: string | undefined = typeof body.modelId === "string" && body.modelId.trim()
    ? body.modelId.trim()
    : undefined;
  if (requestedModelId) {
    try {
      const modelsRes = await fetch(`${req.nextUrl.origin}/api/models`);
      if (modelsRes.ok) {
        const { models } = (await modelsRes.json()) as { models?: Array<{ id: string }> };
        if (models && models.length > 0 && !models.some((m) => m.id === requestedModelId)) {
          return NextResponse.json(
            { error: `Unknown model: ${requestedModelId}`, available: models.map((m) => m.id) },
            { status: 400 },
          );
        }
      }
    } catch {
      // If model validation fails, proceed with the requested ID — agent will fallback
    }
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

  // R1: Guard against concurrent runs — abort the old run if one is active
  if (chatRow.activeRunId) {
    const [activeRun] = await db
      .select({ status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.id, chatRow.activeRunId))
      .limit(1);

    if (activeRun && (activeRun.status === "running" || activeRun.status === "queued")) {
      if (isRedisConfigured()) {
        const abortRedis = createRedisClient("abort-prev-run");
        try {
          await abortRedis.set(`run:${chatRow.activeRunId}:abort`, "1", "EX", 3600);
        } finally {
          abortRedis.disconnect();
        }
      }
      await db
        .update(chats)
        .set({ activeRunId: null, updatedAt: new Date() })
        .where(eq(chats.id, chatRow.id));
    }
  }

  const modelId = requestedModelId ?? "anthropic/claude-sonnet-4-5";
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
    modelId,
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

      const forge = createForgeProvider(userSession.forgejoToken);
      const resolvedSkills = await resolveSkillsForSessionRow(
        sessionRow,
        forge,
        sessionRow.forgeUsername ?? userSession.username,
      );

      await enqueueJob(redis, {
        runId,
        chatId: chatRow.id,
        sessionId: id,
        userId: String(userSession.userId),
        messages,
        resolvedSkills,
        projectConfig: sessionRow.projectConfig,
        projectContext: sessionRow.projectContext,
        modelId,
        requestId,
        maxRetries: 3,
      });
    } finally {
      redis.disconnect();
    }
  } else {
    console.warn("[message] Redis not configured — agent job not enqueued");
  }

  // Auto-title on first message (fire-and-forget)
  const [{ value: msgCount }] = await db
    .select({ value: count() })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatRow.id));

  if (msgCount <= 1) {
    const origin = req.nextUrl.origin;
    fetch(`${origin}/api/sessions/${id}/auto-title`, {
      method: "POST",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, messageId, runId });
}
