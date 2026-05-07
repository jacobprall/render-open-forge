import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import type Redis from "ioredis";
import { desc, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { agentRuns, chats, chatMessages, specs, sessions } from "@render-open-forge/db";
import {
  AppError,
  enqueueJob,
  ensureConsumerGroup,
  publishRunEvent,
} from "@render-open-forge/shared";
import { ForgejoClient } from "@render-open-forge/shared/lib/forgejo/client";
import type { ForgeAgentContext, SandboxAdapter } from "./context/agent-context";
import { jobMessagesToModelMessages, sanitizeMessages, validateMessages } from "./messages";
import { buildAgentSystemPrompt } from "./system-prompt";
import {
  bashTool,
  readFileTool,
  writeFileTool,
  globTool,
  grepTool,
  gitTool,
  createPullRequestTool,
  editFileTool,
  webFetchTool,
  taskTool,
  todoWriteTool,
  askUserQuestionTool,
} from "./tools";
import { getModel, getModelDef, DEFAULT_MODEL_ID } from "./models";
import { getDb } from "./db";
import type { AgentJob, StreamEvent, SessionPhase } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AssistantPart = Record<string, unknown>;

class AbortError extends Error {
  constructor(public readonly parts: AssistantPart[]) {
    super("ABORTED");
    this.name = "AbortError";
  }
}

async function isAborted(redis: Redis, runId: string): Promise<boolean> {
  const val = await redis.get(`run:${runId}:abort`);
  return val === "1";
}

async function publishEvent(redis: Redis, runId: string, event: StreamEvent, requestId?: string): Promise<void> {
  const payload = JSON.stringify({ ...event, requestId });
  await publishRunEvent(redis, runId, payload);
}

function getForgejoClient(): ForgejoClient {
  const url = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return new ForgejoClient(url, token);
}

// ─── Message building ────────────────────────────────────────────────────────

function buildModelMessages(job: AgentJob): ModelMessage[] {
  const raw = job.modelMessages?.length
    ? (job.modelMessages as ModelMessage[])
    : jobMessagesToModelMessages(job.messages);
  return sanitizeMessages(raw, job.chatId);
}

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
  if (!validateMessages(out as ModelMessage[])) return undefined;
  return out;
}

// ─── Tool registry ───────────────────────────────────────────────────────────

function buildToolSet(redis: Redis, job: AgentJob): ToolSet {
  const reqId = job.requestId;
  return {
    bash: bashTool(),
    read_file: readFileTool(),
    write_file: writeFileTool(),
    edit: editFileTool(),
    glob: globTool(),
    grep: grepTool(),
    git: gitTool(),
    create_pull_request: createPullRequestTool(),
    web_fetch: webFetchTool,
    task: taskTool(async (event) => {
      await publishEvent(redis, job.runId, event as unknown as StreamEvent, reqId);
    }),
    todo_write: todoWriteTool(),
    ask_user_question: askUserQuestionTool(job.runId, () => redis.duplicate(), async (event) => {
      await publishEvent(redis, job.runId, event as unknown as StreamEvent, reqId);
    }),
  };
}

// ─── Core turn execution ─────────────────────────────────────────────────────

async function runTurn(params: {
  job: AgentJob;
  redis: Redis;
  phase: SessionPhase;
  adapter: SandboxAdapter;
}): Promise<{
  text: string;
  assistantParts: AssistantPart[];
  responseMessages: ModelMessage[];
}> {
  const { job, redis, phase, adapter } = params;
  const modelDef = getModelDef(job.modelId);
  const model = getModel(job.modelId);
  const isAnthropic = modelDef.provider === "anthropic";

  const thinkingOptions =
    isAnthropic && modelDef.supportsThinking
      ? { anthropic: { thinking: { type: "adaptive" as const }, output_config: { effort: "high" as const } } }
      : undefined;

  const appended = [job.fixContext].filter(Boolean).join("\n\n");
  const systemPrompt =
    buildAgentSystemPrompt({ phase, workflowMode: job.workflowMode, projectContext: job.projectContext, projectConfig: job.projectConfig })
    + (appended ? `\n\n${appended}` : "");

  const db = getDb();
  const [sessionRow] = await db
    .select({ forgejoRepoPath: sessions.forgejoRepoPath, branch: sessions.branch, baseBranch: sessions.baseBranch })
    .from(sessions)
    .where(eq(sessions.id, job.sessionId))
    .limit(1);

  const forgejoClient = getForgejoClient();
  const repoPath = sessionRow?.forgejoRepoPath ?? "";
  const [repoOwner, repoName] = repoPath.split("/");

  const reqId = job.requestId;
  let accumulatedText = "";
  let assistantParts: AssistantPart[] = [];

  const forgeContext: ForgeAgentContext = {
    __brand: "ForgeAgentContext",
    sessionId: job.sessionId,
    adapter,
    forgejoClient,
    repoOwner: repoOwner ?? "",
    repoName: repoName ?? "",
    branch: sessionRow?.branch ?? "main",
    baseBranch: sessionRow?.baseBranch ?? "main",
    onFileChanged: async (p) => {
      const ev: StreamEvent = { type: "file_changed", path: p.path, additions: p.additions, deletions: p.deletions };
      await publishEvent(redis, job.runId, ev, reqId);
      assistantParts.push({ type: "file_changed", ...p });
    },
  };

  const tools = buildToolSet(redis, job);
  const inputMessages = buildModelMessages(job);

  console.log(
    `[agent] runId=${job.runId} phase=${phase} messages=${inputMessages.length}`,
  );

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: inputMessages,
    tools,
    stopWhen: stepCountIs(30),
    experimental_context: forgeContext,
    providerOptions: thinkingOptions,
    onStepFinish: async ({ text, toolCalls, toolResults }) => {
      if (await isAborted(redis, job.runId)) {
        throw new AbortError(assistantParts);
      }

      if (text) {
        accumulatedText += text;
        const ev: StreamEvent = { type: "token", token: text };
        assistantParts.push({ type: "text", text });
        await publishEvent(redis, job.runId, ev, reqId);
      }

      for (const tc of toolCalls ?? []) {
        const ev: StreamEvent = { type: "tool_call", toolName: tc.toolName, toolCallId: tc.toolCallId, args: tc.input };
        assistantParts.push({ type: "tool_call", ...ev });
        await publishEvent(redis, job.runId, ev, reqId);
      }

      for (const tr of toolResults ?? []) {
        const ev: StreamEvent = { type: "tool_result", toolCallId: tr.toolCallId, result: tr.output };
        assistantParts.push({ type: "tool_result", ...ev });
        await publishEvent(redis, job.runId, ev, reqId);
      }

      if (phase === "spec" && text) {
        const spec = extractSpec(text);
        if (spec) {
          await publishEvent(redis, job.runId, { type: "spec", spec }, reqId);
          try { await insertSpecDraft(job, spec); } catch (err) { console.error("Failed to persist spec:", err); }
        }
      }
    },
  });

  return {
    text: accumulatedText || result.text,
    assistantParts,
    responseMessages: result.response.messages as ModelMessage[],
  };
}

// ─── Spec extraction ─────────────────────────────────────────────────────────

function extractSpec(text: string): unknown | null {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const last = matches[matches.length - 1];
  if (!last?.[1]) return null;
  try { return JSON.parse(last[1]); } catch { return null; }
}

async function insertSpecDraft(job: AgentJob, rawSpec: unknown): Promise<void> {
  if (!rawSpec || typeof rawSpec !== "object") return;
  const s = rawSpec as Record<string, unknown>;

  const db = getDb();
  const [latest] = await db
    .select()
    .from(specs)
    .where(eq(specs.sessionId, job.sessionId))
    .orderBy(desc(specs.version))
    .limit(1);

  await db.insert(specs).values({
    id: nanoid(),
    sessionId: job.sessionId,
    version: (latest?.version ?? 0) + 1,
    status: "draft",
    goal: typeof s.goal === "string" ? s.goal : "",
    approach: typeof s.approach === "string" ? s.approach : "",
    filesToModify: Array.isArray(s.filesToModify) ? s.filesToModify : [],
    filesToCreate: Array.isArray(s.filesToCreate) ? s.filesToCreate : [],
    risks: Array.isArray(s.risks) ? s.risks : [],
    outOfScope: Array.isArray(s.outOfScope) ? s.outOfScope : [],
    verificationPlan: typeof s.verificationPlan === "string" ? s.verificationPlan : "",
    estimatedComplexity: ["trivial", "small", "medium", "large"].includes(s.estimatedComplexity as string)
      ? (s.estimatedComplexity as "trivial" | "small" | "medium" | "large")
      : "small",
    createdAt: new Date(),
  });
}

// ─── Verification & fix enqueueing ──────────────────────────────────────────

async function enqueueFixRun(job: AgentJob, redis: Redis, failure: string): Promise<string> {
  const db = getDb();

  await db.insert(chatMessages).values({
    id: nanoid(),
    chatId: job.chatId,
    role: "user",
    parts: [{ type: "text", text: `Verification failed. Fix the issues:\n\n${failure}` }],
    createdAt: new Date(),
  });

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, job.chatId))
    .orderBy(asc(chatMessages.createdAt));

  const messages = rows.map((m) => ({ role: m.role as "user" | "assistant", content: m.parts }));
  const collectedModelMessages = collectModelMessages(rows);

  const newRunId = nanoid();

  await db.insert(agentRuns).values({
    id: newRunId,
    chatId: job.chatId,
    sessionId: job.sessionId,
    userId: job.userId,
    modelId: job.modelId ?? DEFAULT_MODEL_ID,
    phase: "execute",
    status: "queued",
    createdAt: new Date(),
  });

  await db.update(chats).set({ activeRunId: newRunId, updatedAt: new Date() }).where(eq(chats.id, job.chatId));
  await db.update(sessions).set({ phase: "execute", updatedAt: new Date() }).where(eq(sessions.id, job.sessionId));

  await ensureConsumerGroup(redis);
  await enqueueJob(redis, {
    runId: newRunId,
    chatId: job.chatId,
    sessionId: job.sessionId,
    userId: job.userId,
    messages,
    modelMessages: collectedModelMessages,
    phase: "execute",
    workflowMode: job.workflowMode,
    projectConfig: job.projectConfig,
    projectContext: job.projectContext,
    modelId: job.modelId,
    fixContext: failure,
    requestId: job.requestId,
    maxRetries: job.maxRetries ?? 3,
  });

  return newRunId;
}

// ─── Repo cloning ────────────────────────────────────────────────────────────

async function ensureRepoCloned(job: AgentJob, adapter: SandboxAdapter): Promise<void> {
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, job.sessionId)).limit(1);
  if (!session?.forgejoRepoPath) return;

  const files = await adapter.listFiles(job.sessionId, "*").catch(() => [] as string[]);
  if (files.length > 0) return;

  const forgejoClient = getForgejoClient();
  const [owner, repo] = session.forgejoRepoPath.split("/");
  if (!owner || !repo) return;

  const authenticatedUrl = forgejoClient.authenticatedCloneUrl(owner, repo);
  const plainUrl = forgejoClient.plainCloneUrl(owner, repo);

  const cloneArgs = ["clone", "--depth", "1"];
  if (session.branch) cloneArgs.push("--branch", session.branch);
  cloneArgs.push(authenticatedUrl, ".");

  console.log(`[clone] cloning ${session.forgejoRepoPath} for session ${job.sessionId}`);
  const result = await adapter.git(job.sessionId, cloneArgs);
  if (result.exitCode !== 0) {
    console.error(`[clone] failed for session ${job.sessionId}:`, result.stderr);
  } else {
    console.log(`[clone] success for session ${job.sessionId}`);
    await adapter.git(job.sessionId, ["remote", "set-url", "origin", plainUrl]);
  }
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

async function persistAssistantMessage(
  job: AgentJob,
  parts: AssistantPart[],
  responseMessages: ModelMessage[],
): Promise<string> {
  const db = getDb();
  const id = nanoid();
  await db.insert(chatMessages).values({
    id,
    chatId: job.chatId,
    role: "assistant",
    parts: parts as unknown as Record<string, unknown>[],
    modelMessages: responseMessages as unknown as Record<string, unknown>[],
    createdAt: new Date(),
  });
  return id;
}

async function updateRunStatus(
  job: AgentJob,
  status: "completed" | "failed" | "aborted",
): Promise<void> {
  const db = getDb();
  const finishedAt = new Date();
  const [row] = await db
    .select({ startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, job.runId))
    .limit(1);
  const totalDurationMs = row?.startedAt ? finishedAt.getTime() - row.startedAt.getTime() : null;

  await db
    .update(agentRuns)
    .set({ status, finishedAt, totalDurationMs })
    .where(eq(agentRuns.id, job.runId));

  await db.update(chats).set({ activeRunId: null, updatedAt: new Date() }).where(eq(chats.id, job.chatId));
  await db.update(sessions).set({ lastActivityAt: finishedAt, updatedAt: finishedAt }).where(eq(sessions.id, job.sessionId));
}

// ─── Public entry point ──────────────────────────────────────────────────────

export async function runAgentTurn(job: AgentJob, redis: Redis): Promise<void> {
  let streamedParts: AssistantPart[] = [];
  let latestResponseMessages: ModelMessage[] = [];

  // TODO: resolve sandbox adapter from provider registry
  // For now, using a placeholder that will be filled when sandbox is fully ported
  const adapter: SandboxAdapter = null as unknown as SandboxAdapter;

  try {
    const db = getDb();

    await db.update(agentRuns).set({ status: "running", startedAt: new Date() }).where(eq(agentRuns.id, job.runId));
    await redis.set(`run:${job.runId}:status`, "running", "EX", 3600);

    await ensureRepoCloned(job, adapter);

    const { assistantParts, responseMessages } = await runTurn({
      job,
      redis,
      phase: job.phase,
      adapter,
    });

    streamedParts = assistantParts;
    latestResponseMessages = responseMessages;

    let assistantMessageId: string | undefined;
    if (assistantParts.length > 0) {
      assistantMessageId = await persistAssistantMessage(job, assistantParts, responseMessages);
    }

    await updateRunStatus(job, "completed");

    await publishEvent(
      redis,
      job.runId,
      { type: "done", assistantMessageId, assistantParts: assistantParts as unknown[] },
      job.requestId,
    );
    await redis.set(`run:${job.runId}:status`, "completed", "EX", 3600);
  } catch (error) {
    if (error instanceof AbortError) {
      await updateRunStatus(job, "aborted");
      await publishEvent(redis, job.runId, { type: "aborted" }, job.requestId);
      await redis.set(`run:${job.runId}:status`, "aborted", "EX", 3600);
      return;
    }

    await updateRunStatus(job, "failed");
    await publishEvent(
      redis,
      job.runId,
      {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        requestId: job.requestId,
        retryable: error instanceof AppError ? error.retryable : false,
      },
      job.requestId,
    );
    await redis.set(`run:${job.runId}:status`, "failed", "EX", 3600);
    throw error;
  }
}
