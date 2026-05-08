import { and, asc, count, desc, eq } from "drizzle-orm";
import {
  agentRuns,
  chatMessages,
  chats,
  ciEvents,
  prEvents,
  sessions,
  specs,
  userPreferences,
} from "@openforge/db";
import type { CiEvent, SessionPhase } from "@openforge/db";
import {
  SessionNotFoundError,
  ValidationError,
  logger,
} from "@openforge/shared";
import type { ActiveSkillRef } from "@openforge/skills";
import type { PlatformDb } from "../interfaces/database";
import type { AuthContext } from "../interfaces/auth";
import type { QueueAdapter } from "../interfaces/queue";
import type { EventBus } from "../interfaces/events";
import { getDefaultForgeProvider } from "../forge/factory";
import { resolveLlmApiKeys } from "../auth/api-key-resolver";
import { askUserReplyQueueKey } from "../events/run-stream";
import { resolveSkillsForSession } from "./session-skills";
import { validateModel } from "./session-model-validation";
import { generateAutoTitle as generateAutoTitleImpl } from "./session-auto-title";
import {
  DEFAULT_MODEL_ID,
  startAgentJob,
  enqueueSessionTriggerJob,
  getOrCreateChatId,
} from "./session-agent-jobs";

// ---------------------------------------------------------------------------
// Re-exports from sub-modules (preserves the public API surface)
// ---------------------------------------------------------------------------

export type { AutoTitleResult } from "./session-auto-title";
export type { AgentTrigger } from "./session-agent-jobs";

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  repoPath: string;
  branch: string;
  title?: string;
  activeSkills?: Array<{ source: "builtin" | "user" | "repo"; slug: string }>;
}

export interface SendMessageParams {
  content: string;
  modelId?: string;
  /** Caller-supplied request ID for tracing (falls back to a new UUID). */
  requestId?: string;
}

export interface ReplyParams {
  toolCallId: string;
  message: string;
  /** Explicit run ID; if omitted, the chat's activeRunId is used. */
  runId?: string;
}

export interface SpecActionParams {
  action: "approve" | "reject";
  specId: string;
  rejectionNote?: string;
}

export interface ReviewJobParams {
  /** Caller-supplied trigger context; defaults to a standard review prompt. */
  fixContext?: string;
}

// ---------------------------------------------------------------------------
// Valid session phases
// ---------------------------------------------------------------------------

const VALID_PHASES: SessionPhase[] = [
  "understand",
  "spec",
  "execute",
  "verify",
  "deliver",
  "complete",
  "failed",
];

// ---------------------------------------------------------------------------
// SessionService
// ---------------------------------------------------------------------------

export class SessionService {
  constructor(
    private db: PlatformDb,
    private queue: QueueAdapter,
    private events: EventBus,
  ) {}

  // -------------------------------------------------------------------------
  // create — POST /api/sessions
  // -------------------------------------------------------------------------

  async create(auth: AuthContext, params: CreateSessionParams): Promise<{ sessionId: string }> {
    const { repoPath, branch, activeSkills } = params;
    const title = (params.title && String(params.title).trim()) || "New session";

    const sessionId = crypto.randomUUID();
    const chatId = crypto.randomUUID();

    const [prefsRow] = await this.db
      .select({ data: userPreferences.data })
      .from(userPreferences)
      .where(eq(userPreferences.userId, auth.userId))
      .limit(1);
    const preferredModel = prefsRow?.data?.defaultModelId ?? undefined;

    await this.db.insert(sessions).values({
      id: sessionId,
      userId: auth.userId,
      forgeUsername: auth.username,
      title,
      status: "running",
      forgejoRepoPath: repoPath,
      branch,
      baseBranch: "main",
      phase: "execute",
      workflowMode: "standard",
      activeSkills: Array.isArray(activeSkills) && activeSkills.length > 0 ? activeSkills : null,
    });

    await this.db.insert(chats).values({
      id: chatId,
      sessionId,
      title,
      ...(preferredModel ? { modelId: preferredModel } : {}),
    });

    return { sessionId };
  }

  // -------------------------------------------------------------------------
  // archive — server action / API
  // -------------------------------------------------------------------------

  async archive(auth: AuthContext, sessionId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: sessions.id, status: sessions.status })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!row) throw new SessionNotFoundError();
    if (row.status === "running") {
      throw new ValidationError("Cannot archive a running session");
    }
    if (row.status === "archived") {
      throw new ValidationError("Session is already archived");
    }

    await this.db
      .update(sessions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)));
  }

  // -------------------------------------------------------------------------
  // sendMessage — POST /api/sessions/[id]/message
  // -------------------------------------------------------------------------

  async sendMessage(
    auth: AuthContext,
    sessionId: string,
    params: SendMessageParams,
  ): Promise<{ messageId: string; runId: string; isFirstMessage: boolean }> {
    const { content, requestId: callerRequestId } = params;
    const requestId = callerRequestId ?? crypto.randomUUID();

    const [sessionRow] = await this.db
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
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!sessionRow) {
      throw new SessionNotFoundError();
    }

    // Validate model if provided
    const requestedModelId = params.modelId?.trim() || undefined;
    if (requestedModelId) {
      try {
        const keys = await resolveLlmApiKeys(this.db, auth.userId);
        const vr = await validateModel(requestedModelId, keys);
        if (!vr.ok) {
          throw new ValidationError(vr.error, { details: { available: vr.available } });
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        // Catalog fetch failed — proceed with requested model
      }
    }

    // Get or create the most recent chat
    let [chatRow] = await this.db
      .select()
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .orderBy(desc(chats.createdAt))
      .limit(1);

    if (!chatRow) {
      const chatId = crypto.randomUUID();
      [chatRow] = await this.db
        .insert(chats)
        .values({
          id: chatId,
          sessionId,
          title: sessionRow.title,
        })
        .returning();
    }

    // Abort previous active run if still running/queued
    if (chatRow.activeRunId) {
      const [activeRun] = await this.db
        .select({ status: agentRuns.status })
        .from(agentRuns)
        .where(eq(agentRuns.id, chatRow.activeRunId))
        .limit(1);

      if (activeRun && (activeRun.status === "running" || activeRun.status === "queued")) {
        await Promise.all([
          this.events.setKey(`run:${chatRow.activeRunId}:abort`, "1", 3600),
          this.db
            .update(chats)
            .set({ activeRunId: null, updatedAt: new Date() })
            .where(eq(chats.id, chatRow.id)),
        ]);
      }
    }

    const modelId = requestedModelId ?? DEFAULT_MODEL_ID;
    const messageId = crypto.randomUUID();
    const runId = crypto.randomUUID();

    // Insert message and create run row in parallel
    await Promise.all([
      this.db.insert(chatMessages).values({
        id: messageId,
        chatId: chatRow.id,
        role: "user",
        parts: [{ type: "text", text: content }],
      }),
      this.db.insert(agentRuns).values({
        id: runId,
        chatId: chatRow.id,
        sessionId,
        userId: auth.userId,
        modelId,
        status: "queued",
        createdAt: new Date(),
      }),
    ]);

    // Update chat active run and session activity timestamp
    await Promise.all([
      this.db
        .update(chats)
        .set({ activeRunId: runId, updatedAt: new Date() })
        .where(eq(chats.id, chatRow.id)),
      this.db
        .update(sessions)
        .set({ lastActivityAt: new Date(), updatedAt: new Date() })
        .where(eq(sessions.id, sessionId)),
    ]);

    // Build messages list and resolve skills, then enqueue the agent job
    const rows = await this.db
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

    const forge = getDefaultForgeProvider(auth.forgeToken);
    const resolvedSkills = await resolveSkillsForSession(
      sessionRow,
      forge,
      sessionRow.forgeUsername ?? auth.username,
    );

    await this.queue.ensureGroup();
    await this.queue.enqueue({
      runId,
      chatId: chatRow.id,
      sessionId,
      userId: auth.userId,
      messages,
      resolvedSkills,
      projectConfig: sessionRow.projectConfig ?? undefined,
      projectContext: sessionRow.projectContext ?? undefined,
      modelId,
      requestId,
      maxRetries: 3,
    });

    // Detect first message (caller can use this to trigger auto-title)
    const [{ value: msgCount }] = await this.db
      .select({ value: count() })
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatRow.id));

    return { messageId, runId, isFirstMessage: msgCount <= 1 };
  }

  // -------------------------------------------------------------------------
  // getActiveRunId — shared helper for stream/stop
  // -------------------------------------------------------------------------

  async getActiveRunId(auth: AuthContext, sessionId: string): Promise<string | null> {
    const [sessionRow] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!sessionRow) throw new SessionNotFoundError();

    const [chatRow] = await this.db
      .select({ activeRunId: chats.activeRunId })
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .orderBy(desc(chats.createdAt))
      .limit(1);

    return chatRow?.activeRunId ?? null;
  }

  // -------------------------------------------------------------------------
  // stop — POST /api/sessions/[id]/stop
  // -------------------------------------------------------------------------

  async stop(auth: AuthContext, sessionId: string): Promise<{ runId: string }> {
    const [sessionRow] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!sessionRow) throw new SessionNotFoundError();

    const [chatRow] = await this.db
      .select()
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .orderBy(desc(chats.createdAt))
      .limit(1);

    const runId = chatRow?.activeRunId;
    if (!runId) {
      throw new ValidationError("No active run");
    }

    await this.events.setKey(`run:${runId}:abort`, "1", 3600);

    return { runId };
  }

  // -------------------------------------------------------------------------
  // updatePhase — POST /api/sessions/[id]/phase
  // -------------------------------------------------------------------------

  async updatePhase(auth: AuthContext, sessionId: string, phase: string): Promise<void> {
    if (!phase || !VALID_PHASES.includes(phase as SessionPhase)) {
      throw new ValidationError("Invalid phase");
    }

    const updated = await this.db
      .update(sessions)
      .set({
        phase: phase as SessionPhase,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .returning({ id: sessions.id });

    if (updated.length === 0) throw new SessionNotFoundError();
  }

  // -------------------------------------------------------------------------
  // reply — POST /api/sessions/[id]/reply
  // -------------------------------------------------------------------------

  async reply(auth: AuthContext, sessionId: string, params: ReplyParams): Promise<void> {
    const { toolCallId, message, runId: explicitRunId } = params;

    if (!toolCallId || !message?.trim()) {
      throw new ValidationError("toolCallId and message required");
    }

    const [sessionRow] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!sessionRow) throw new SessionNotFoundError();

    const [chatRow] = await this.db
      .select()
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .orderBy(desc(chats.createdAt))
      .limit(1);

    const effectiveRunId = explicitRunId ?? chatRow?.activeRunId;
    if (!effectiveRunId) {
      throw new ValidationError("No active agent run — cannot deliver reply");
    }

    // Validate the run belongs to this session
    const [run] = await this.db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.id, effectiveRunId), eq(agentRuns.sessionId, sessionId)))
      .limit(1);
    if (!run) {
      throw new ValidationError("Invalid run context");
    }

    const key = askUserReplyQueueKey(effectiveRunId, toolCallId);
    await this.events.listPush(key, JSON.stringify({ message: message.trim() }));
  }

  // -------------------------------------------------------------------------
  // updateConfig — PATCH /api/sessions/[id]/config
  // -------------------------------------------------------------------------

  async updateConfig(
    auth: AuthContext,
    sessionId: string,
    configPatch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!configPatch || typeof configPatch !== "object" || Array.isArray(configPatch)) {
      throw new ValidationError("Provide projectConfig or projectConfigPatch object");
    }

    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!row) throw new SessionNotFoundError();

    const base =
      typeof row.projectConfig === "object" && row.projectConfig !== null
        ? ({ ...(row.projectConfig as object) } as Record<string, unknown>)
        : {};
    Object.assign(base, configPatch);

    const [updated] = await this.db
      .update(sessions)
      .set({
        projectConfig: Object.keys(base).length ? base : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .returning({ id: sessions.id, projectConfig: sessions.projectConfig });

    return (updated?.projectConfig ?? {}) as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // getSkills — GET /api/sessions/[id]/skills
  // -------------------------------------------------------------------------

  async getSkills(auth: AuthContext, sessionId: string): Promise<ActiveSkillRef[]> {
    const [row] = await this.db
      .select({ activeSkills: sessions.activeSkills })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!row) throw new SessionNotFoundError();

    return (row.activeSkills ?? []) as ActiveSkillRef[];
  }

  // -------------------------------------------------------------------------
  // updateSkills — PATCH /api/sessions/[id]/skills
  // -------------------------------------------------------------------------

  async updateSkills(
    auth: AuthContext,
    sessionId: string,
    activeSkills: ActiveSkillRef[],
  ): Promise<void> {
    if (!Array.isArray(activeSkills)) {
      throw new ValidationError("activeSkills array required");
    }

    for (const r of activeSkills) {
      if (
        !r ||
        (r.source !== "builtin" && r.source !== "user" && r.source !== "repo") ||
        typeof r.slug !== "string"
      ) {
        throw new ValidationError("Invalid skill ref");
      }
    }

    const updated = await this.db
      .update(sessions)
      .set({
        activeSkills,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .returning({ id: sessions.id });

    if (updated.length === 0) throw new SessionNotFoundError();
  }

  // -------------------------------------------------------------------------
  // handleSpecAction — POST /api/sessions/[id]/spec
  // -------------------------------------------------------------------------

  async handleSpecAction(
    auth: AuthContext,
    sessionId: string,
    params: SpecActionParams,
  ): Promise<{ runId: string }> {
    const { action, specId, rejectionNote = "" } = params;

    if (!action || !specId) {
      throw new ValidationError("action and specId required");
    }

    const [sessionRow] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!sessionRow) throw new SessionNotFoundError();

    const [specRow] = await this.db
      .select()
      .from(specs)
      .where(and(eq(specs.id, specId), eq(specs.sessionId, sessionId)))
      .limit(1);

    if (!specRow) {
      throw new SessionNotFoundError("Spec not found");
    }

    const chatId = await getOrCreateChatId(this.db, sessionId, sessionRow.title);

    try {
      if (action === "approve") {
        await this.db
          .update(specs)
          .set({ status: "approved", approvedAt: new Date() })
          .where(eq(specs.id, specId));

        await this.db.insert(chatMessages).values({
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

        const runId = await startAgentJob(this.db, this.queue, {
          sessionRow,
          chatId,
          authUserId: auth.userId,
          authUsername: auth.username,
          forgeToken: auth.forgeToken,
          projectConfigPatch: { lastApprovedSpecId: specId },
        });

        return { runId };
      }

      // reject
      if (!rejectionNote.trim()) {
        throw new ValidationError("rejectionNote required when rejecting");
      }

      await this.db
        .update(specs)
        .set({ status: "rejected", rejectionNote })
        .where(eq(specs.id, specId));

      await this.db.insert(chatMessages).values({
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

      const runId = await startAgentJob(this.db, this.queue, {
        sessionRow,
        chatId,
        authUserId: auth.userId,
        authUsername: auth.username,
        forgeToken: auth.forgeToken,
        fixContext: `Revise specification per feedback:\n${rejectionNote.trim()}`,
      });

      return { runId };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      logger.errorWithCause(err, "spec action failed", { sessionId });
      throw new ValidationError("Failed to enqueue agent job");
    }
  }

  // -------------------------------------------------------------------------
  // generateAutoTitle — POST /api/sessions/[id]/auto-title
  // -------------------------------------------------------------------------

  async generateAutoTitle(
    sessionId: string,
    userId: string,
  ): Promise<import("./session-auto-title").AutoTitleResult> {
    return generateAutoTitleImpl(this.db, sessionId, userId);
  }

  // -------------------------------------------------------------------------
  // listCiEvents — GET /api/sessions/[id]/ci-events
  // -------------------------------------------------------------------------

  async listCiEvents(auth: AuthContext, sessionId: string): Promise<CiEvent[]> {
    const [s] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!s) throw new SessionNotFoundError();

    return this.db
      .select()
      .from(ciEvents)
      .where(eq(ciEvents.sessionId, sessionId))
      .orderBy(desc(ciEvents.createdAt))
      .limit(50);
  }

  // -------------------------------------------------------------------------
  // enqueueReviewJob — POST /api/sessions/[id]/review
  // -------------------------------------------------------------------------

  async enqueueReviewJob(
    auth: AuthContext,
    sessionId: string,
    _params: ReviewJobParams = {},
  ): Promise<{ runId: string; chatId: string } | null> {
    const [sessionRow] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1);

    if (!sessionRow) throw new SessionNotFoundError();

    if (!sessionRow.prNumber) {
      throw new ValidationError("No PR associated with this session");
    }

    const reviewContext = [
      `Please review pull request #${sessionRow.prNumber} on ${sessionRow.forgejoRepoPath}.`,
      `Read the full diff using pull_request_diff, then submit a thorough code review using review_pr.`,
      `Focus on: correctness, potential bugs, performance issues, security concerns, and code style.`,
      `If everything looks good, approve the PR. Otherwise, leave constructive inline comments.`,
    ].join("\n");

    const result = await enqueueSessionTriggerJob(this.db, this.queue, {
      sessionRow,
      userId: auth.userId,
      trigger: "review_comment",
      fixContext: reviewContext,
    });

    if (!result) return null;

    await this.db.insert(prEvents).values({
      id: crypto.randomUUID(),
      userId: auth.userId,
      sessionId,
      repoPath: sessionRow.forgejoRepoPath,
      prNumber: sessionRow.prNumber,
      action: "review_requested",
      title: sessionRow.title,
      actionNeeded: false,
      read: true,
      metadata: { runId: result.runId, triggeredBy: "user" },
    });

    return result;
  }
}
