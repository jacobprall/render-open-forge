import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats, chatMessages, agentRuns } from "@render-open-forge/db";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { resolveLlmApiKeys } from "@render-open-forge/platform";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import { enqueueAgentMessage } from "@/lib/sessions/enqueue-message";
import { createForgeProvider } from "@/lib/forgejo/client";
import { resolveSkillsForSessionRow } from "@/lib/skills/resolve-for-session";
import { validateModelOrThrow } from "@/lib/models/anthropic-models";

const postMessageBodySchema = z.object({
  content: z.string().min(1).max(100_000),
  modelId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, userSession] = await Promise.all([params, getSession()]);
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const [sessionRow] = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      forgejoRepoPath: sessions.forgejoRepoPath,
      branch: sessions.branch,
      activeSkills: sessions.activeSkills,
      forgeUsername: sessions.forgeUsername,
      projectConfig: sessions.projectConfig,
      projectContext: sessions.projectContext,
    })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(userSession.userId))))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = postMessageBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { content, modelId: rawModelId } = parsed.data;

  const requestedModelId: string | undefined =
    rawModelId && rawModelId.trim() ? rawModelId.trim() : undefined;
  if (requestedModelId) {
    try {
      const keys = await resolveLlmApiKeys(db, String(userSession.userId));
      const vr = await validateModelOrThrow(requestedModelId, keys);
      if (!vr.ok) {
        return NextResponse.json(
          { error: vr.error, available: vr.available },
          { status: 400 },
        );
      }
    } catch {
      // Catalog fetch failed — proceed with requested model
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

  if (chatRow.activeRunId) {
    const [activeRun] = await db
      .select({ status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.id, chatRow.activeRunId))
      .limit(1);

    if (activeRun && (activeRun.status === "running" || activeRun.status === "queued")) {
      const redisTask = isRedisConfigured()
        ? (async () => {
            const abortRedis = createRedisClient("abort-prev-run");
            try {
              await abortRedis.set(`run:${chatRow.activeRunId}:abort`, "1", "EX", 3600);
            } finally {
              abortRedis.disconnect();
            }
          })()
        : Promise.resolve();

      await Promise.all([
        redisTask,
        db
          .update(chats)
          .set({ activeRunId: null, updatedAt: new Date() })
          .where(eq(chats.id, chatRow.id)),
      ]);
    }
  }

  const modelId = requestedModelId ?? "anthropic/claude-sonnet-4-5";
  const messageId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  await Promise.all([
    db.insert(chatMessages).values({
      id: messageId,
      chatId: chatRow.id,
      role: "user",
      parts: [{ type: "text", text: content }],
    }),
    db.insert(agentRuns).values({
      id: runId,
      chatId: chatRow.id,
      sessionId: id,
      userId: String(userSession.userId),
      modelId,
      status: "queued",
      createdAt: new Date(),
    }),
  ]);

  await Promise.all([
    db
      .update(chats)
      .set({ activeRunId: runId, updatedAt: new Date() })
      .where(eq(chats.id, chatRow.id)),
    db
      .update(sessions)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, id)),
  ]);

  if (isRedisConfigured()) {
    const redis = createRedisClient("chat-enqueue");
    try {
      const rows = await db
        .select({
          role: chatMessages.role,
          parts: chatMessages.parts,
        })
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

      await enqueueAgentMessage({
        redis,
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
      });
    } finally {
      redis.disconnect();
    }
  } else {
    console.warn("[message] Redis not configured — agent job not enqueued");
  }

  const [{ value: msgCount }] = await db
    .select({ value: count() })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatRow.id));

  if (msgCount <= 1) {
    const userId = String(userSession.userId);
    after(async () => {
      try {
        const { generateAutoTitle } = await import("@/lib/sessions/auto-title");
        await generateAutoTitle(id, userId);
      } catch (err) {
        console.error("[auto-title] Failed:", err);
      }
    });
  }

  return NextResponse.json({ success: true, messageId, runId });
}
