import { and, asc, count, desc, eq } from "drizzle-orm";
import {
  agentRuns,
  chatMessages,
  chats,
  ciEvents,
  prEvents,
  sessions,
  specs,
} from "@render-open-forge/db";
import type { CiEvent, SessionPhase } from "@render-open-forge/db";
import {
  SessionNotFoundError,
  ValidationError,
  InsufficientPermissionsError,
  logger,
} from "@render-open-forge/shared";
import {
  ensureUserSkillsRepo,
  getBuiltinRaw,
  listMdSlugsInRepoPath,
  normalizeActiveSkills,
  resolveActiveSkills,
  REPO_SKILLS_PATH,
  skillMarkdownToResolved,
} from "@render-open-forge/skills";
import type { ResolvedSkill, ActiveSkillRef } from "@render-open-forge/skills";
import type { PlatformDb } from "../interfaces/database";
import type { AuthContext } from "../interfaces/auth";
import type { QueueAdapter } from "../interfaces/queue";
import type { EventBus } from "../interfaces/events";
import { getDefaultForgeProvider } from "../forge/factory";
import type { ForgeProvider } from "../forge/provider";
import { resolveLlmApiKeys } from "../auth/api-key-resolver";
import { askUserReplyQueueKey } from "../events/run-stream";

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

export type AutoTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: "no-api-key" | "not-found" | "no-chat" };

export type AgentTrigger =
  | "user_message"
  | "ci_failure"
  | "review_comment"
  | "pr_opened"
  | "pr_merged"
  | "workflow_run";

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

const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4-5";

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
        const vr = await this.validateModel(requestedModelId, keys);
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
    const resolvedSkills = await this.resolveSkillsForSession(
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

    // When runId is explicitly provided, validate it belongs to this session
    if (!explicitRunId) {
      const [run] = await this.db
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(and(eq(agentRuns.id, effectiveRunId), eq(agentRuns.sessionId, sessionId)))
        .limit(1);
      if (!run) {
        throw new ValidationError("Invalid run context");
      }
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

    const chatId = await this.getOrCreateChatId(sessionId, sessionRow.title);

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

        const runId = await this.startAgentJob({
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

      const runId = await this.startAgentJob({
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

  async generateAutoTitle(sessionId: string, userId: string): Promise<AutoTitleResult> {
    const keys = await resolveLlmApiKeys(this.db, userId);
    const apiKey = keys.anthropic;
    if (!apiKey) {
      return { ok: false, reason: "no-api-key" };
    }

    const [sessionRow] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);

    if (!sessionRow) {
      return { ok: false, reason: "not-found" };
    }

    const [chatRow] = await this.db
      .select()
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .limit(1);

    if (!chatRow) {
      return { ok: false, reason: "no-chat" };
    }

    const msgs = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatRow.id))
      .orderBy(asc(chatMessages.createdAt))
      .limit(6);

    const textParts = msgs
      .flatMap((m) => {
        const parts = m.parts as Array<{ type: string; text?: string }>;
        return parts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => `${m.role}: ${p.text}`);
      })
      .slice(0, 4);

    if (textParts.length === 0) {
      return { ok: true, title: sessionRow.title };
    }

    const conversation = textParts.join("\n").slice(0, 2000);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 30,
          messages: [
            {
              role: "user",
              content: `Generate a short title (3-6 words, no quotes) for this coding session:\n\n${conversation}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        console.error("[auto-title] Anthropic API error:", res.status);
        return { ok: true, title: sessionRow.title };
      }

      const body = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const raw = body.content?.[0]?.text?.trim();
      if (!raw) {
        return { ok: true, title: sessionRow.title };
      }

      const title = raw.replace(/^["']|["']$/g, "").slice(0, 80);

      await this.db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
      await this.db.update(chats).set({ title }).where(eq(chats.sessionId, sessionId));

      return { ok: true, title };
    } catch (err) {
      console.error("[auto-title] Failed:", err);
      return { ok: true, title: sessionRow.title };
    }
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

    const result = await this.enqueueSessionTriggerJob({
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

  // =========================================================================
  // Private helpers
  // =========================================================================

  /** Resolve the forge provider to use for user-scoped forge API calls. */
  private forgeForUser(forgeToken: string): ForgeProvider {
    return getDefaultForgeProvider(forgeToken);
  }

  /**
   * Load ordered skill bodies for an agent job.
   * Mirrors the logic in apps/web/lib/skills/resolve-for-session.ts.
   */
  private async resolveSkillsForSession(
    sessionRow: {
      forgejoRepoPath: string;
      branch: string;
      activeSkills: Array<{ source: "builtin" | "user" | "repo"; slug: string }> | null | undefined;
    },
    forge: ForgeProvider,
    forgeUsername: string,
  ): Promise<ResolvedSkill[]> {
    if (forgeUsername) {
      await ensureUserSkillsRepo(forge, forgeUsername);
    }

    const [owner, repo] = sessionRow.forgejoRepoPath.split("/");
    const repoSlugs =
      owner && repo
        ? await listMdSlugsInRepoPath(forge, owner, repo, REPO_SKILLS_PATH, sessionRow.branch)
        : [];

    const active = normalizeActiveSkills(sessionRow.activeSkills, repoSlugs);
    const resolved = await resolveActiveSkills(forge, {
      activeSkills: active,
      forgeUsername,
      projectRepoPath: sessionRow.forgejoRepoPath,
      ref: sessionRow.branch,
    });

    if (resolved.length === 0) {
      const fallback = getBuiltinRaw("implementation");
      if (fallback) {
        return [skillMarkdownToResolved("builtin", "implementation", fallback)];
      }
    }

    return resolved;
  }

  /**
   * Collect model-level messages from chat rows for context continuity.
   * Returns undefined if any assistant row lacks modelMessages (graceful degradation).
   */
  private collectModelMessages(
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
    if (out.length === 0) return undefined;
    return out;
  }

  /** Get or create the most recent chat row for a session, returning its id. */
  private async getOrCreateChatId(sessionId: string, title: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .orderBy(desc(chats.createdAt))
      .limit(1);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    await this.db.insert(chats).values({ id, sessionId, title });
    return id;
  }

  /**
   * Create an agent run, set it as the chat's active run, and enqueue the job.
   * Used by spec approve/reject to re-launch the agent with synthetic context.
   */
  private async startAgentJob(params: {
    sessionRow: typeof sessions.$inferSelect;
    chatId: string;
    authUserId: string;
    authUsername: string;
    forgeToken: string;
    projectConfigPatch?: Record<string, unknown>;
    fixContext?: string;
  }): Promise<string> {
    const { sessionRow, chatId, authUserId, authUsername, forgeToken, projectConfigPatch, fixContext } =
      params;

    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(asc(chatMessages.createdAt));

    const messages = rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.parts,
    }));

    const modelMessages = this.collectModelMessages(rows);
    const runId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const baseConfig =
      typeof sessionRow.projectConfig === "object" && sessionRow.projectConfig !== null
        ? ({ ...(sessionRow.projectConfig as object) } as Record<string, unknown>)
        : {};
    Object.assign(baseConfig, projectConfigPatch ?? {});

    const sessionForResolve = {
      ...sessionRow,
      projectConfig: Object.keys(baseConfig).length ? baseConfig : sessionRow.projectConfig,
    };
    const forge = this.forgeForUser(forgeToken);
    const resolvedSkills = await this.resolveSkillsForSession(
      sessionForResolve,
      forge,
      authUsername,
    );

    await this.db.insert(agentRuns).values({
      id: runId,
      chatId,
      sessionId: sessionRow.id,
      userId: authUserId,
      modelId: DEFAULT_MODEL_ID,
      status: "queued",
      trigger: "user_message",
      createdAt: new Date(),
    });

    await this.db
      .update(chats)
      .set({ activeRunId: runId, updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    await this.queue.ensureGroup();
    await this.queue.enqueue({
      runId,
      chatId,
      sessionId: sessionRow.id,
      userId: authUserId,
      messages,
      modelMessages,
      resolvedSkills,
      projectConfig: Object.keys(baseConfig).length ? baseConfig : undefined,
      projectContext: sessionRow.projectContext ?? undefined,
      modelId: DEFAULT_MODEL_ID,
      fixContext,
      requestId,
      maxRetries: 3,
      trigger: "user_message",
    });

    return runId;
  }

  /**
   * Enqueue an agent job triggered by a non-user-message event (CI, review, etc.).
   * Mirrors the logic in apps/web/lib/agent/enqueue-session-job.ts.
   */
  private async enqueueSessionTriggerJob(params: {
    sessionRow: typeof sessions.$inferSelect;
    userId: string;
    chatTitle?: string;
    trigger: Exclude<AgentTrigger, "user_message">;
    fixContext: string;
    modelId?: string;
  }): Promise<{ runId: string; chatId: string } | null> {
    const { sessionRow, userId, trigger, fixContext, modelId } = params;

    if (trigger === "ci_failure") {
      const attempts = sessionRow.ciFixAttempts ?? 0;
      const max = sessionRow.maxCiFixAttempts ?? 3;
      if (attempts >= max) return null;
      await this.db
        .update(sessions)
        .set({ ciFixAttempts: attempts + 1, updatedAt: new Date() })
        .where(eq(sessions.id, sessionRow.id));
    }

    const chatId = await this.getOrCreateChatId(
      sessionRow.id,
      params.chatTitle ?? sessionRow.title,
    );

    await this.db.insert(chatMessages).values({
      id: crypto.randomUUID(),
      chatId,
      role: "user",
      parts: [{ type: "text", text: fixContext }],
    });

    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(asc(chatMessages.createdAt));

    const messages = rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.parts,
    }));

    const modelMessages = this.collectModelMessages(rows);
    const runId = crypto.randomUUID();

    // Use the agent's forge token (no user OAuth token for webhook-triggered jobs)
    const forge = getDefaultForgeProvider(
      process.env.FORGEJO_AGENT_TOKEN ?? "",
    );
    const resolvedSkills = await this.resolveSkillsForSession(
      sessionRow,
      forge,
      sessionRow.forgeUsername ?? "",
    );

    const effectiveModelId = modelId ?? DEFAULT_MODEL_ID;

    await this.db.insert(agentRuns).values({
      id: runId,
      chatId,
      sessionId: sessionRow.id,
      userId,
      modelId: effectiveModelId,
      status: "queued",
      trigger,
      createdAt: new Date(),
    });

    await this.db
      .update(chats)
      .set({ activeRunId: runId, updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    await this.db
      .update(sessions)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, sessionRow.id));

    await this.queue.ensureGroup();
    await this.queue.enqueue({
      runId,
      chatId,
      sessionId: sessionRow.id,
      userId,
      messages,
      modelMessages,
      resolvedSkills,
      projectConfig: sessionRow.projectConfig,
      projectContext: sessionRow.projectContext ?? undefined,
      modelId: effectiveModelId,
      fixContext,
      trigger,
      maxRetries: 3,
    });

    return { runId, chatId };
  }

  /**
   * Validate that a model ID is known and the user has credentials for its provider.
   * Returns ok: true if valid, or ok: false with a human-readable error and available list.
   *
   * This mirrors validateModelOrThrow from apps/web/lib/models/anthropic-models.ts but
   * avoids importing a Next.js-coupled module from the platform layer.
   */
  private async validateModel(
    modelId: string,
    keys: { anthropic?: string; openai?: string },
  ): Promise<{ ok: true } | { ok: false; error: string; available: string[] }> {
    if (modelId.startsWith("openai/")) {
      if (!keys.openai) {
        return {
          ok: false,
          error: "No OpenAI API key configured. Add one in Settings → API Keys or set OPENAI_API_KEY.",
          available: [],
        };
      }
      return { ok: true };
    }

    // For Anthropic, attempt a live catalog check
    if (keys.anthropic) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: {
            "x-api-key": keys.anthropic,
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const body = (await res.json()) as { data?: Array<{ id: string }> };
          const ids = (body.data ?? []).map((m) => {
            const provider = "anthropic";
            const normalized = m.id.replace(/-\d{8}$/, "");
            return `${provider}/${normalized}`;
          });
          if (ids.length > 0 && !ids.includes(modelId)) {
            return { ok: false, error: `Unknown model: ${modelId}`, available: ids };
          }
        }
      } catch {
        // Catalog fetch failed — allow the requested model through
      }
    }

    return { ok: true };
  }
}
