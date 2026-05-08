import { generateText, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import type Redis from "ioredis";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { agentRuns, chats, chatMessages, specs, sessions, prEvents, mirrors, syncConnections } from "@openforge/db";
import { AppError } from "@openforge/shared";
import { resolveLlmApiKeys, type ResolvedLlmKeys, type PlatformContainer, type PlatformDb, type EventBus } from "@openforge/platform";
import { getDefaultForgeProvider, createForgeProvider, type ForgeProvider, type ForgeProviderType } from "@openforge/platform/forge";
import {
  SharedHttpSandboxProvider,
  type SandboxAdapter,
  type SandboxSessionAuth,
} from "@openforge/sandbox";
import type { ForgeAgentContext, UpstreamMirrorInfo } from "./context/agent-context";
import { jobMessagesToModelMessages, sanitizeMessages } from "./messages";
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
  mergePrTool,
  closePrTool,
  addPrCommentTool,
  requestReviewTool,
  approvePrTool,
  createRepoTool,
  readBuildLogTool,
  pullRequestDiffTool,
  reviewPrTool,
  resolveCommentTool,
  submitSpecTool,
  type SubmitSpecInput,
} from "./tools";
import { getModel, getModelDef } from "./models";
import type { AgentJob, StreamEvent } from "./types";
import { isDeliverComplete, transitionToComplete } from "./lib/deliver";
import { rewriteForSandbox } from "./sandbox-url";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_STEPS = 50;
const RUN_STATUS_TTL = 3600;
const EVENT_STREAM_TTL = 86_400; // 24h

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AssistantPart = Record<string, unknown>;

class AbortError extends Error {
  constructor(public readonly parts: AssistantPart[]) {
    super("ABORTED");
    this.name = "AbortError";
  }
}

async function isAborted(events: EventBus, runId: string): Promise<boolean> {
  const val = await events.getKey(`run:${runId}:abort`);
  return val === "1";
}

async function publishEvent(events: EventBus, runId: string, event: StreamEvent, requestId?: string): Promise<void> {
  const payload = JSON.stringify({ ...event, requestId });
  await events.publish(runId, payload);
}

/** Expire the run event stream after a terminal event so keys don't accumulate. */
async function expireRunStream(redis: Redis, runId: string): Promise<void> {
  await redis.expire(`run:${runId}:events`, EVENT_STREAM_TTL).catch(() => {});
}

function getForgeProvider(): ForgeProvider {
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return getDefaultForgeProvider(token);
}

/** Fire-and-forget: tell Forgejo to pull from upstream so the mirror reflects new branches. */
function triggerMirrorSync(forge: ForgeProvider, owner: string, repo: string): void {
  forge.mirrors.sync(owner, repo).catch((err) => {
    console.warn(`[agent] mirror sync failed for ${owner}/${repo}:`, err);
  });
}

/**
 * Extract (owner, repo) from a remote URL.
 * Handles https://github.com/user/repo.git, git@github.com:user/repo.git, etc.
 */
function parseRemoteUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/(?:https?:\/\/[^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

function providerBaseUrl(provider: string): string {
  switch (provider) {
    case "github": return "https://api.github.com";
    case "gitlab": return "https://gitlab.com";
    default: return "https://api.github.com";
  }
}

async function resolveUpstreamMirror(
  db: PlatformDb,
  forgejoRepoPath: string,
): Promise<UpstreamMirrorInfo | undefined> {
  if (!forgejoRepoPath) return undefined;

  const [mirrorRow] = await db
    .select({
      remoteRepoUrl: mirrors.remoteRepoUrl,
      direction: mirrors.direction,
      syncConnectionId: mirrors.syncConnectionId,
    })
    .from(mirrors)
    .where(eq(mirrors.forgejoRepoPath, forgejoRepoPath))
    .limit(1);

  if (!mirrorRow) return undefined;
  if (mirrorRow.direction !== "pull" && mirrorRow.direction !== "bidirectional") return undefined;

  const [conn] = await db
    .select({
      provider: syncConnections.provider,
      accessToken: syncConnections.accessToken,
    })
    .from(syncConnections)
    .where(eq(syncConnections.id, mirrorRow.syncConnectionId))
    .limit(1);

  if (!conn?.accessToken) return undefined;

  const parsed = parseRemoteUrl(mirrorRow.remoteRepoUrl);
  if (!parsed) return undefined;

  const provider = conn.provider as ForgeProviderType;
  const baseUrl = providerBaseUrl(provider);
  const forge = createForgeProvider({ type: provider, baseUrl, token: conn.accessToken });

  return {
    provider,
    remoteRepoUrl: mirrorRow.remoteRepoUrl,
    forge,
    remoteOwner: parsed.owner,
    remoteRepo: parsed.repo,
  };
}

let _sandboxProvider: SharedHttpSandboxProvider | null = null;
let _sandboxProviderCreatedAt = 0;
const SANDBOX_PROVIDER_MAX_AGE_MS = 10 * 60 * 1000; // 10 min

function getSandboxProvider(): SharedHttpSandboxProvider {
  const now = Date.now();
  if (_sandboxProvider && now - _sandboxProviderCreatedAt < SANDBOX_PROVIDER_MAX_AGE_MS) {
    return _sandboxProvider;
  }
  const host = process.env.SANDBOX_SERVICE_HOST;
  if (!host) throw new Error("SANDBOX_SERVICE_HOST not configured");
  const secret = process.env.SANDBOX_SHARED_SECRET;
  const sessionSecret = process.env.SANDBOX_SESSION_SECRET;
  const sessionAuth: SandboxSessionAuth | undefined = sessionSecret
    ? { secret: sessionSecret, userId: "openforge-agent" }
    : undefined;
  _sandboxProvider = new SharedHttpSandboxProvider(host, secret, sessionAuth);
  _sandboxProviderCreatedAt = now;
  return _sandboxProvider;
}

async function getAdapter(sessionId: string): Promise<SandboxAdapter> {
  try {
    const provider = getSandboxProvider();
    return await provider.provision(sessionId);
  } catch {
    // Invalidate cached provider on connection failure and retry once
    _sandboxProvider = null;
    _sandboxProviderCreatedAt = 0;
    const provider = getSandboxProvider();
    return provider.provision(sessionId);
  }
}

// ─── Message building ────────────────────────────────────────────────────────

function buildModelMessages(job: AgentJob): ModelMessage[] {
  const raw = job.modelMessages?.length
    ? (job.modelMessages as ModelMessage[])
    : jobMessagesToModelMessages(job.messages);
  return sanitizeMessages(raw, job.chatId);
}

// ─── Part normalization ──────────────────────────────────────────────────────

/**
 * Merge standalone tool_result parts into their corresponding tool_call parts
 * so persisted chat history matches the shape appendStreamEvent produces for
 * live streaming (tool_call with embedded result).
 */
function mergeToolResults(parts: AssistantPart[]): AssistantPart[] {
  const toolCallMap = new Map<string, AssistantPart>();
  const merged: AssistantPart[] = [];

  for (const part of parts) {
    if (part.type === "tool_call" && typeof part.toolCallId === "string") {
      toolCallMap.set(part.toolCallId, part);
      merged.push(part);
    } else if (part.type === "tool_result" && typeof part.toolCallId === "string") {
      const tc = toolCallMap.get(part.toolCallId);
      if (tc) {
        tc.result = part.result;
      }
      // Don't push standalone tool_result — it's merged into tool_call
    } else {
      merged.push(part);
    }
  }

  return merged;
}

// ─── Tool registry ───────────────────────────────────────────────────────────

function buildSubagentToolSet(): ToolSet {
  return {
    bash: bashTool(),
    read_file: readFileTool(),
    write_file: writeFileTool(),
    edit: editFileTool(),
    glob: globTool(),
    grep: grepTool(),
    git: gitTool(),
    create_pull_request: createPullRequestTool(),
    web_fetch: webFetchTool(),
  };
}

function buildToolSet(
  events: EventBus,
  redis: Redis,
  db: PlatformDb,
  job: AgentJob,
  model: LanguageModel,
  skillsPromptSuffix: string,
): ToolSet {
  const reqId = job.requestId;
  return {
    ...buildSubagentToolSet(),
    task: taskTool(
      async (event) => {
        await publishEvent(events, job.runId, event as unknown as StreamEvent, reqId);
      },
      buildSubagentToolSet,
      model,
      skillsPromptSuffix,
    ),
    todo_write: todoWriteTool(),
    ask_user_question: askUserQuestionTool(job.runId, () => redis.duplicate(), async (event) => {
      await publishEvent(events, job.runId, event as unknown as StreamEvent, reqId);
    }),
    merge_pr: mergePrTool(),
    close_pr: closePrTool(),
    add_pr_comment: addPrCommentTool(),
    request_review: requestReviewTool(),
    approve_pr: approvePrTool(),
    create_repo: createRepoTool(),
    read_build_log: readBuildLogTool(),
    pull_request_diff: pullRequestDiffTool(),
    review_pr: reviewPrTool(),
    resolve_comment: resolveCommentTool(),
    submit_spec: submitSpecTool(
      async (event) => {
        await publishEvent(events, job.runId, event, reqId);
      },
      async (spec) => {
        await persistSubmittedSpec(db, job.sessionId, spec);
      },
    ),
  };
}

async function persistSubmittedSpec(db: PlatformDb, sessionId: string, spec: SubmitSpecInput): Promise<void> {
  const [latest] = await db
    .select()
    .from(specs)
    .where(eq(specs.sessionId, sessionId))
    .orderBy(desc(specs.version))
    .limit(1);

  await db.insert(specs).values({
    id: nanoid(),
    sessionId,
    version: (latest?.version ?? 0) + 1,
    status: "draft",
    goal: spec.goal,
    approach: spec.approach,
    filesToModify: spec.filesToModify ?? [],
    filesToCreate: spec.filesToCreate ?? [],
    risks: spec.risks ?? [],
    outOfScope: spec.outOfScope ?? [],
    verificationPlan: spec.verificationPlan,
    estimatedComplexity: spec.estimatedComplexity ?? "small",
    createdAt: new Date(),
  });
}

// ─── Core turn execution ─────────────────────────────────────────────────────

function buildProviderOptions(job: AgentJob, llmKeys: ResolvedLlmKeys) {
  const modelDef = getModelDef(job.modelId);
  const isAnthropic = modelDef.provider === "anthropic";
  const thinkingType = isAnthropic ? modelDef.thinkingType : undefined;

  if (!thinkingType) return undefined;
  return thinkingType === "adaptive"
    ? {
        anthropic: {
          thinking: { type: "adaptive" as const, budget_tokens: 16000 },
          output_config: { effort: "high" as const },
        },
      }
    : {
        anthropic: {
          thinking: { type: "enabled" as const, budget_tokens: 8000 },
        },
      };
}

function buildSystemPromptForJob(job: AgentJob): string {
  const appended = [job.fixContext].filter(Boolean).join("\n\n");
  const base = buildAgentSystemPrompt({
    skills: job.resolvedSkills,
    projectContext: job.projectContext,
    projectConfig: job.projectConfig,
  });
  return appended ? `${base}\n\n${appended}` : base;
}

function buildWorkspaceContext(
  sessionRow: { forgejoRepoPath: string; branch: string; baseBranch: string } | undefined,
  ctx: ForgeAgentContext,
): string | null {
  if (!sessionRow?.forgejoRepoPath) return null;

  const workdir = `/workspace/${ctx.sessionId}`;

  const lines = [
    "# Workspace",
    "",
    `- **Repository:** ${sessionRow.forgejoRepoPath}`,
    `- **Branch:** ${sessionRow.branch || "main"}`,
    `- **Base branch:** ${sessionRow.baseBranch || "main"}`,
    `- **Working directory:** \`${workdir}\` — the repo is cloned here. All bash and git commands execute in this directory automatically. Do NOT \`cd\` elsewhere; \`cd\` does not persist between commands.`,
  ];

  if (ctx.repoOwner && ctx.repoName) {
    lines.push(`- **Owner:** ${ctx.repoOwner}`);
  }

  if (ctx.upstream) {
    lines.push(
      `- **Upstream:** ${ctx.upstream.provider} — ${ctx.upstream.remoteOwner}/${ctx.upstream.remoteRepo} (push and PRs target the upstream, not the internal forge)`,
    );
  }

  return lines.join("\n");
}

async function buildForgeContext(params: {
  job: AgentJob;
  db: PlatformDb;
  events: EventBus;
  adapter: SandboxAdapter;
  assistantParts: AssistantPart[];
}): Promise<{ forgeContext: ForgeAgentContext; sessionRow: { forgejoRepoPath: string; branch: string; baseBranch: string; title: string } | undefined }> {
  const { job, db, events, adapter, assistantParts } = params;
  const reqId = job.requestId;

  const [sessionRow] = await db
    .select({ forgejoRepoPath: sessions.forgejoRepoPath, branch: sessions.branch, baseBranch: sessions.baseBranch, title: sessions.title })
    .from(sessions)
    .where(eq(sessions.id, job.sessionId))
    .limit(1);

  const forge = getForgeProvider();
  const repoPath = sessionRow?.forgejoRepoPath ?? "";
  const [repoOwner, repoName] = repoPath.split("/");

  const upstream = await resolveUpstreamMirror(db, repoPath);
  if (upstream) {
    console.log(`[agent] upstream mirror detected: ${upstream.provider} ${upstream.remoteOwner}/${upstream.remoteRepo}`);
  }

  const forgeContext: ForgeAgentContext = {
    __brand: "ForgeAgentContext",
    sessionId: job.sessionId,
    adapter,
    forge,
    repoOwner: repoOwner ?? "",
    repoName: repoName ?? "",
    branch: sessionRow?.branch ?? "main",
    baseBranch: sessionRow?.baseBranch ?? "main",
    upstream,
    onFileChanged: async (p) => {
      const ev: StreamEvent = { type: "file_changed", path: p.path, additions: p.additions, deletions: p.deletions };
      await publishEvent(events, job.runId, ev, reqId);
      assistantParts.push({ type: "file_changed", ...p });
    },
    onPrCreated: async ({ prNumber }) => {
      await db
        .update(sessions)
        .set({ prNumber, prStatus: "open", updatedAt: new Date() })
        .where(eq(sessions.id, job.sessionId));

      await db.insert(prEvents).values({
        id: crypto.randomUUID(),
        userId: job.userId,
        sessionId: job.sessionId,
        repoPath: sessionRow?.forgejoRepoPath ?? "",
        prNumber,
        action: "opened",
        title: sessionRow?.title ?? "PR",
        actionNeeded: true,
        metadata: { createdByAgent: true, runId: job.runId },
      });

      // After creating a PR on an upstream, trigger a mirror sync so
      // the Forgejo copy reflects the new branch/PR promptly.
      if (upstream && repoOwner && repoName) {
        triggerMirrorSync(forge, repoOwner, repoName);
      }
    },
  };

  return { forgeContext, sessionRow };
}

async function runTurn(params: {
  job: AgentJob;
  redis: Redis;
  events: EventBus;
  db: PlatformDb;
  adapter: SandboxAdapter;
  llmKeys: ResolvedLlmKeys;
}): Promise<{
  text: string;
  assistantParts: AssistantPart[];
  responseMessages: ModelMessage[];
  usage: { promptTokens?: number; completionTokens?: number };
  hitStepLimit: boolean;
}> {
  const { job, redis, events, db, adapter, llmKeys } = params;
  const model = getModel(job.modelId, llmKeys);
  const thinkingOptions = buildProviderOptions(job, llmKeys);

  const reqId = job.requestId;
  let accumulatedText = "";
  const assistantParts: AssistantPart[] = [];
  let stepCount = 0;

  const { forgeContext, sessionRow } = await buildForgeContext({ job, db, events, adapter, assistantParts });

  const basePrompt = buildSystemPromptForJob(job);
  const workspaceBlock = buildWorkspaceContext(sessionRow, forgeContext);
  const systemPrompt = workspaceBlock ? `${basePrompt}\n\n${workspaceBlock}` : basePrompt;

  const skillsSuffix = job.resolvedSkills.length > 0
    ? `## Important notes\n- All git operations target the internal Forgejo instance. Authentication is automatic.\n- When creating a PR, push your branch first with the git tool, then use create_pull_request.\n- The repository is already cloned in your workspace. Use glob/grep to explore it.`
    : "";

  const tools = buildToolSet(events, redis, db, job, model, skillsSuffix);
  const inputMessages = buildModelMessages(job);

  console.log(
    `[agent] runId=${job.runId} skills=${job.resolvedSkills.map((s) => s.slug).join(",")} messages=${inputMessages.length}`,
  );

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: inputMessages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    experimental_context: forgeContext,
    providerOptions: thinkingOptions,
    onStepFinish: async ({ text, toolCalls, toolResults }) => {
      stepCount++;
      if (await isAborted(events, job.runId)) {
        throw new AbortError(assistantParts);
      }

      if (text) {
        accumulatedText += text;
        const ev: StreamEvent = { type: "token", token: text };
        assistantParts.push({ type: "text", text });
        await publishEvent(events, job.runId, ev, reqId);
      }

      for (const tc of toolCalls ?? []) {
        const ev: StreamEvent = { type: "tool_call", toolName: tc.toolName, toolCallId: tc.toolCallId, args: tc.input };
        assistantParts.push({ type: "tool_call", toolName: tc.toolName, toolCallId: tc.toolCallId, args: tc.input });
        await publishEvent(events, job.runId, ev, reqId);
      }

      for (const tr of toolResults ?? []) {
        const ev: StreamEvent = { type: "tool_result", toolCallId: tr.toolCallId, result: tr.output };
        assistantParts.push({ type: "tool_result", toolCallId: tr.toolCallId, result: tr.output });
        await publishEvent(events, job.runId, ev, reqId);
      }
    },
  });

  const hitStepLimit = stepCount >= MAX_STEPS;

  if (hitStepLimit) {
    const limitMsg = `Reached the maximum step limit (${MAX_STEPS}). Send another message to continue where I left off.`;
    assistantParts.push({ type: "text", text: limitMsg });
    await publishEvent(events, job.runId, { type: "token", token: limitMsg }, reqId);
  }

  return {
    text: accumulatedText || result.text,
    assistantParts: mergeToolResults(assistantParts),
    responseMessages: result.response.messages as ModelMessage[],
    usage: {
      promptTokens: result.usage?.inputTokens,
      completionTokens: result.usage?.outputTokens,
    },
    hitStepLimit,
  };
}

// ─── Repo cloning ────────────────────────────────────────────────────────────

async function ensureRepoCloned(db: PlatformDb, job: AgentJob, adapter: SandboxAdapter): Promise<void> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, job.sessionId)).limit(1);
  if (!session?.forgejoRepoPath) return;

  const globResult = await adapter.glob(job.sessionId, "*").catch(() => ({ files: [] as string[] }));
  if (globResult.files.length > 0) return;

  const forge = getForgeProvider();
  const [owner, repo] = session.forgejoRepoPath.split("/");
  if (!owner || !repo) return;

  const authenticatedUrl = rewriteForSandbox(forge.git.authenticatedCloneUrl(owner, repo));
  const plainUrl = rewriteForSandbox(forge.git.plainCloneUrl(owner, repo));

  const cloneArgs = ["clone", "--depth", "50"];
  if (session.branch) cloneArgs.push("--branch", session.branch);
  cloneArgs.push(authenticatedUrl, ".");

  console.log(`[clone] cloning ${session.forgejoRepoPath} for session ${job.sessionId}`);
  const result = await adapter.git(job.sessionId, cloneArgs);
  if (result.exitCode !== 0) {
    const branchNotFound = result.stderr?.includes("not found in upstream") ||
      result.stderr?.includes("Remote branch") && result.stderr?.includes("not found");

    if (branchNotFound && session.branch) {
      // Branch doesn't exist remotely — clone default branch, then create it locally
      console.log(`[clone] branch "${session.branch}" not found, cloning default branch`);
      const defaultArgs = ["clone", "--depth", "50", authenticatedUrl, "."];
      const defaultResult = await adapter.git(job.sessionId, defaultArgs);
      if (defaultResult.exitCode !== 0) {
        console.error(`[clone] default branch clone failed for session ${job.sessionId}:`, defaultResult.stderr);
        return;
      }
      const checkout = await adapter.git(job.sessionId, ["checkout", "-b", session.branch]);
      if (checkout.exitCode !== 0) {
        console.error(`[clone] branch creation failed for session ${job.sessionId}:`, checkout.stderr);
        return;
      }
    } else {
      // Try full clone as fallback (non-branch-related failure)
      console.error(`[clone] failed for session ${job.sessionId}:`, result.stderr);
      const fullArgs = ["clone"];
      if (session.branch) fullArgs.push("--branch", session.branch);
      fullArgs.push(authenticatedUrl, ".");
      const retry = await adapter.git(job.sessionId, fullArgs);
      if (retry.exitCode !== 0) {
        console.error(`[clone] full clone also failed for session ${job.sessionId}:`, retry.stderr);
        return;
      }
    }
  }
  console.log(`[clone] success for session ${job.sessionId}`);
  await adapter.git(job.sessionId, ["remote", "set-url", "origin", plainUrl]);
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

async function persistAssistantMessage(
  db: PlatformDb,
  job: AgentJob,
  parts: AssistantPart[],
  responseMessages: ModelMessage[],
): Promise<string> {
  const id = nanoid();
  await db.insert(chatMessages).values({
    id,
    chatId: job.chatId,
    role: "assistant",
    parts: parts as unknown as Record<string, unknown>[],
    modelMessages: responseMessages as unknown as Record<string, unknown>[],
  });
  return id;
}

async function updateRunStatus(
  db: PlatformDb,
  job: AgentJob,
  status: "completed" | "failed" | "aborted",
  usage?: { promptTokens?: number; completionTokens?: number },
): Promise<void> {
  const finishedAt = new Date();
  const [row] = await db
    .select({ startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, job.runId))
    .limit(1);
  const totalDurationMs = row?.startedAt ? finishedAt.getTime() - row.startedAt.getTime() : null;

  const updateData: Record<string, unknown> = { status, finishedAt, totalDurationMs };
  if (usage?.promptTokens != null) updateData.promptTokens = usage.promptTokens;
  if (usage?.completionTokens != null) updateData.completionTokens = usage.completionTokens;

  await db
    .update(agentRuns)
    .set(updateData)
    .where(eq(agentRuns.id, job.runId));

  await db.update(chats).set({ activeRunId: null, updatedAt: new Date() }).where(eq(chats.id, job.chatId));
  await db.update(sessions).set({ lastActivityAt: finishedAt, updatedAt: finishedAt }).where(eq(sessions.id, job.sessionId));
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runAgentTurn(job: AgentJob, redis: Redis, platform: PlatformContainer): Promise<void> {
  const { db, events } = platform;
  const adapter = await getAdapter(job.sessionId);

  try {
    await db.update(agentRuns).set({ status: "running", startedAt: new Date() }).where(eq(agentRuns.id, job.runId));
    await events.setKey(`run:${job.runId}:status`, "running", RUN_STATUS_TTL);

    await ensureRepoCloned(db, job, adapter);

    const llmKeys = await resolveLlmApiKeys(db, job.userId);

    const { assistantParts, responseMessages, usage } = await runTurn({
      job,
      redis,
      events,
      db,
      adapter,
      llmKeys,
    });

    let assistantMessageId: string | undefined;
    if (assistantParts.length > 0) {
      assistantMessageId = await persistAssistantMessage(db, job, assistantParts, responseMessages);
    }

    await updateRunStatus(db, job, "completed", usage);

    await publishEvent(
      events,
      job.runId,
      { type: "done", assistantMessageId, assistantParts: assistantParts as unknown[] },
      job.requestId,
    );
    await events.setKey(`run:${job.runId}:status`, "completed", RUN_STATUS_TTL);
    await expireRunStream(redis, job.runId);

    const [session] = await db
      .select({ prNumber: sessions.prNumber, prStatus: sessions.prStatus })
      .from(sessions)
      .where(eq(sessions.id, job.sessionId))
      .limit(1);
    if (session && isDeliverComplete(session)) {
      await transitionToComplete(db, job.sessionId);
      await publishEvent(events, job.runId, { type: "phase_changed", phase: "complete" } as unknown as StreamEvent, job.requestId);
    }
  } catch (error) {
    if (error instanceof AbortError) {
      const mergedParts = mergeToolResults(error.parts);
      if (mergedParts.length > 0) {
        await persistAssistantMessage(db, job, mergedParts, []).catch((e) =>
          console.error("[agent] Failed to persist partial abort work:", e),
        );
      }
      await updateRunStatus(db, job, "aborted");
      await publishEvent(events, job.runId, { type: "aborted" }, job.requestId);
      await events.setKey(`run:${job.runId}:status`, "aborted", RUN_STATUS_TTL);
      await expireRunStream(redis, job.runId);
      return;
    }

    await updateRunStatus(db, job, "failed");
    await publishEvent(
      events,
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
    await events.setKey(`run:${job.runId}:status`, "failed", RUN_STATUS_TTL);
    await expireRunStream(redis, job.runId);
    throw error;
  }
}
