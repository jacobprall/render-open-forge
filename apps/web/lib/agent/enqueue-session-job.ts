import type Redis from "ioredis";
import { asc, desc, eq } from "drizzle-orm";
import type { SessionPhase, WorkflowMode } from "@render-open-forge/db";
import {
  agentRuns,
  chatMessages,
  chats,
  sessions,
} from "@render-open-forge/db";
import { enqueueJob, ensureConsumerGroup } from "@render-open-forge/shared";
import type { ForgeDb } from "@/lib/db";

type Db = ForgeDb;

export type AgentTrigger =
  | "user_message"
  | "ci_failure"
  | "review_comment"
  | "pr_opened"
  | "pr_merged"
  | "workflow_run";

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
  if (!validateSdkModelMessages(out as unknown[])) return undefined;
  return out;
}

function validateSdkModelMessages(messages: unknown[]): boolean {
  return messages.length > 0;
}

async function getOrCreateChat(
  db: Db,
  sessionId: string,
  title: string,
): Promise<{ id: string }> {
  const [existing] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.sessionId, sessionId))
    .orderBy(desc(chats.createdAt))
    .limit(1);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.insert(chats).values({ id, sessionId, title });
  return { id };
}

/** Enqueue an agent job for a webhook or internal trigger (adds user message). */
export async function enqueueSessionTriggerJob(
  db: Db,
  redis: Redis,
  params: {
    sessionId: string;
    userId: string;
    chatTitle?: string;
    trigger: Exclude<AgentTrigger, "user_message">;
    fixContext: string;
    phase?: SessionPhase;
    modelId?: string;
  },
): Promise<{ runId: string; chatId: string } | null> {
  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!sessionRow) return null;

  if (params.trigger === "ci_failure") {
    const attempts = sessionRow.ciFixAttempts ?? 0;
    const max = sessionRow.maxCiFixAttempts ?? 3;
    if (attempts >= max) return null;
    await db
      .update(sessions)
      .set({
        ciFixAttempts: attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, params.sessionId));
  }

  const chat = await getOrCreateChat(db, params.sessionId, params.chatTitle ?? sessionRow.title);
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    chatId: chat.id,
    role: "user",
    parts: [{ type: "text", text: params.fixContext }],
  });

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chat.id))
    .orderBy(asc(chatMessages.createdAt));

  const messages = rows.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.parts,
  }));

  const modelMessages = collectModelMessages(rows);

  const runId = crypto.randomUUID();
  const phase = params.phase ?? sessionRow.phase ?? "execute";
  const workflowMode = (sessionRow.workflowMode ?? "standard") as WorkflowMode;

  await db.insert(agentRuns).values({
    id: runId,
    chatId: chat.id,
    sessionId: params.sessionId,
    userId: params.userId,
    modelId: params.modelId ?? "anthropic/claude-sonnet-4-5",
    phase: phase ?? undefined,
    status: "queued",
    trigger: params.trigger,
    createdAt: new Date(),
  });

  await db
    .update(chats)
    .set({ activeRunId: runId, updatedAt: new Date() })
    .where(eq(chats.id, chat.id));

  await db
    .update(sessions)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.id, params.sessionId));

  await ensureConsumerGroup(redis);
  await enqueueJob(redis, {
    runId,
    chatId: chat.id,
    sessionId: params.sessionId,
    userId: params.userId,
    messages,
    modelMessages,
    phase,
    workflowMode,
    projectConfig: sessionRow.projectConfig,
    projectContext: sessionRow.projectContext,
    modelId: params.modelId ?? "anthropic/claude-sonnet-4-5",
    fixContext: params.fixContext,
    trigger: params.trigger,
    maxRetries: 3,
  });

  return { runId, chatId: chat.id };
}
