import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  chats,
  chatMessages,
  agentRuns,
  sessions,
  specs,
} from "@render-open-forge/db";
import { and, asc, desc, eq } from "drizzle-orm";
import type { SessionPhase } from "@render-open-forge/db";
import {
  enqueueJob,
  ensureConsumerGroup,
  logger,
} from "@render-open-forge/shared";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";

function collectModelMessages(
  rows: Array<{ role: string; parts: unknown; modelMessages: unknown }>,
): unknown[] | undefined {
  const out: unknown[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      const parts = row.parts as Array<{ type: string; text?: string }>;
      out.push({ role: "user", content: parts?.[0]?.text ?? JSON.stringify(parts) });
      continue;
    }
    const sdkMsgs = row.modelMessages as unknown[] | null;
    if (sdkMsgs && Array.isArray(sdkMsgs) && sdkMsgs.length > 0) {
      out.push(...sdkMsgs);
    } else {
      return undefined;
    }
  }
  return out.length > 0 ? out : undefined;
}

async function getOrCreateChatId(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  title: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.sessionId, sessionId))
    .orderBy(desc(chats.createdAt))
    .limit(1);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(chats).values({ id, sessionId, title });
  return id;
}

async function startAgentJob(params: {
  db: ReturnType<typeof getDb>;
  redis: ReturnType<typeof createRedisClient>;
  sessionRow: typeof sessions.$inferSelect;
  chatId: string;
  authUserId: string;
  phase: SessionPhase;
  projectConfigPatch?: Record<string, unknown>;
  fixContext?: string;
}) {
  const { db, redis, sessionRow, chatId, authUserId, phase, projectConfigPatch, fixContext } =
    params;

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt));

  const messages = rows.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.parts,
  }));

  const modelMessages = collectModelMessages(rows);
  const runId = crypto.randomUUID();
  const requestId = crypto.randomUUID();

  const baseConfig =
    typeof sessionRow.projectConfig === "object" && sessionRow.projectConfig !== null
      ? ({ ...(sessionRow.projectConfig as object) } as Record<string, unknown>)
      : {};
  Object.assign(baseConfig, projectConfigPatch ?? {});

  await db.insert(agentRuns).values({
    id: runId,
    chatId,
    sessionId: sessionRow.id,
    userId: authUserId,
    modelId: "anthropic/claude-sonnet-4-5",
    phase,
    status: "queued",
    trigger: "user_message",
    createdAt: new Date(),
  });

  await db
    .update(chats)
    .set({ activeRunId: runId, updatedAt: new Date() })
    .where(eq(chats.id, chatId));

  await ensureConsumerGroup(redis);
  await enqueueJob(redis, {
    runId,
    chatId,
    sessionId: sessionRow.id,
    userId: authUserId,
    messages,
    modelMessages,
    phase,
    workflowMode: sessionRow.workflowMode ?? "standard",
    projectConfig: Object.keys(baseConfig).length ? baseConfig : undefined,
    projectContext: sessionRow.projectContext,
    modelId: "anthropic/claude-sonnet-4-5",
    fixContext,
    requestId,
    maxRetries: 3,
    trigger: "user_message",
  });

  return runId;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
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

  const body = await req.json();
  const action = body.action as "approve" | "reject" | undefined;
  const specId = typeof body.specId === "string" ? body.specId : null;
  const rejectionNote = typeof body.rejectionNote === "string" ? body.rejectionNote : "";

  if (!action || !specId) {
    return NextResponse.json({ error: "action and specId required" }, { status: 400 });
  }

  const [specRow] = await db
    .select()
    .from(specs)
    .where(and(eq(specs.id, specId), eq(specs.sessionId, sessionId)))
    .limit(1);

  if (!specRow) {
    return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  }

  const chatId = await getOrCreateChatId(db, sessionId, sessionRow.title);
  const authUserId = String(auth.userId);

  const redis = createRedisClient("spec-action");
  try {
    if (action === "approve") {
      await db
        .update(specs)
        .set({
          status: "approved",
          approvedAt: new Date(),
        })
        .where(eq(specs.id, specId));

      await db
        .update(sessions)
        .set({
          phase: "execute",
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));

      await db.insert(chatMessages).values({
        id: crypto.randomUUID(),
        chatId,
        role: "user",
        parts: [
          {
            type: "text",
            text: `Specification approved.\nGoal: ${specRow.goal}\nProceed with implementation as specified.`,
          },
        ],
      });

      const runId = await startAgentJob({
        db,
        redis,
        sessionRow,
        chatId,
        authUserId,
        phase: "execute",
        projectConfigPatch: { lastApprovedSpecId: specId },
      });

      return NextResponse.json({ success: true, runId });
    }

    if (!rejectionNote.trim()) {
      return NextResponse.json({ error: "rejectionNote required when rejecting" }, { status: 400 });
    }

    await db
      .update(specs)
      .set({
        status: "rejected",
        rejectionNote,
      })
      .where(eq(specs.id, specId));

    await db
      .update(sessions)
      .set({
        phase: "spec",
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    await db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      chatId,
      role: "user",
      parts: [
        {
          type: "text",
          text: `Specification was rejected.\nReviewer feedback:\n${rejectionNote.trim()}\nProduce a revised specification.`,
        },
      ],
    });

    const runId = await startAgentJob({
      db,
      redis,
      sessionRow,
      chatId,
      authUserId,
      phase: "spec",
      fixContext: `Revise specification per feedback:\n${rejectionNote.trim()}`,
    });

    return NextResponse.json({ success: true, runId });
  } catch (err) {
    logger.errorWithCause(err, "spec POST failed", { sessionId });
    return NextResponse.json({ error: "Failed to enqueue agent job" }, { status: 500 });
  } finally {
    redis.disconnect();
  }
}
