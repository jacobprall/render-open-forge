import { timingSafeEqual } from "crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import YAML from "yaml";
import { agentRuns, chatMessages, chats, ciEvents, sessions, syncConnections } from "@openforge/db";
import { logger, ValidationError } from "@openforge/shared";
import {
  ensureUserSkillsRepo,
  getBuiltinRaw,
  listMdSlugsInRepoPath,
  normalizeActiveSkills,
  resolveActiveSkills,
  REPO_SKILLS_PATH,
  skillMarkdownToResolved,
} from "@openforge/skills";
import type { ResolvedSkill } from "@openforge/skills";
import type { PlatformDb } from "../interfaces/database";
import type { QueueAdapter } from "../interfaces/queue";
import type { CIDispatcher, CIJobInput } from "../interfaces/ci-dispatcher";
import { getDefaultForgeProvider, getForgeProviderForAuth } from "../forge/factory";
import type { ForgeProvider, ForgeProviderType } from "../forge/provider";

// ---------------------------------------------------------------------------
// CI Result Payload schema (Zod)
// ---------------------------------------------------------------------------

const ciStepResultSchema = z.object({
  name: z.string(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
});

const ciJobResultSchema = z.object({
  name: z.string(),
  status: z.enum(["success", "failure", "error"]),
  steps: z.array(ciStepResultSchema),
  durationMs: z.number(),
});

export const ciResultPayloadSchema = z.object({
  ciEventId: z.string().min(1),
  workflowName: z.string(),
  status: z.enum(["success", "failure", "error"]),
  jobs: z.array(ciJobResultSchema),
  testResults: z
    .object({
      junitXml: z.string().optional(),
      tapOutput: z.string().optional(),
    })
    .optional(),
  totalDurationMs: z.number(),
});

export type CIResultPayload = z.infer<typeof ciResultPayloadSchema>;

// ---------------------------------------------------------------------------
// Workflow parser types (inline — mirrors apps/web/lib/ci/workflow-parser.ts)
// ---------------------------------------------------------------------------

interface ParsedStep {
  name?: string;
  run: string;
  env?: Record<string, string>;
}

interface ParsedJob {
  name: string;
  steps: ParsedStep[];
  runsOn?: string;
}

interface ParsedWorkflow {
  name: string;
  triggers: { push?: { branches?: string[] }; pullRequest?: { branches?: string[] } };
  jobs: ParsedJob[];
}

// ---------------------------------------------------------------------------
// DispatchForEvent params
// ---------------------------------------------------------------------------

export interface DispatchForEventParams {
  forge: ForgeProvider;
  repoOwner: string;
  repoName: string;
  branch: string;
  commitSha: string;
  event: "push" | "pull_request";
  sessionId: string;
}

export interface DispatchResult {
  ciEventId: string;
  dispatched: boolean;
  error?: string;
}

const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4-5";

// ---------------------------------------------------------------------------
// CIService
// ---------------------------------------------------------------------------

export class CIService {
  constructor(
    private db: PlatformDb,
    private queue: QueueAdapter,
    private ciDispatcher?: CIDispatcher,
  ) {}

  /** Resolve a ForgeProvider for a session, respecting its forgeType. */
  private async getForgeForSession(session: { forgeType: string | null; userId: string }): Promise<ForgeProvider> {
    const forgeType = (session.forgeType ?? "github") as ForgeProviderType;
    if (forgeType === "forgejo") {
      return getDefaultForgeProvider(process.env.FORGEJO_AGENT_TOKEN ?? "");
    }
    const [conn] = await this.db
      .select({ accessToken: syncConnections.accessToken })
      .from(syncConnections)
      .where(and(eq(syncConnections.userId, session.userId), eq(syncConnections.provider, forgeType)))
      .limit(1);
    if (conn?.accessToken) {
      return getForgeProviderForAuth({ forgeToken: conn.accessToken, forgeType });
    }
    return getDefaultForgeProvider(process.env.FORGEJO_AGENT_TOKEN ?? "");
  }

  // -------------------------------------------------------------------------
  // handleResult — POST /api/ci/results
  // -------------------------------------------------------------------------

  /**
   * Process a CI result callback from the Render Workflows task runner.
   * Validates the CI_RUNNER_SECRET, updates the ciEvent row, posts a commit
   * status to Forgejo, and optionally enqueues an agent fix job on failure.
   *
   * @param secret - The value from the x-ci-secret header (empty string if absent).
   */
  async handleResult(secret: string, payload: CIResultPayload): Promise<void> {
    const configuredSecret = process.env.CI_RUNNER_SECRET;
    if (configuredSecret) {
      if (!timingSafeEqualUtf8(secret, configuredSecret)) {
        throw new ValidationError("Invalid CI runner secret");
      }
    }

    const [event] = await this.db
      .select()
      .from(ciEvents)
      .where(eq(ciEvents.id, payload.ciEventId))
      .limit(1);

    if (!event) {
      logger.warn("ci result: ci_events row not found", { ciEventId: payload.ciEventId });
      return;
    }

    if (event.processed) {
      logger.info("ci result: duplicate callback ignored", { ciEventId: payload.ciEventId });
      return;
    }

    const existingPayload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {};

    const rowStatus: "success" | "failure" | "error" =
      payload.status === "success" ? "success" : payload.status === "error" ? "error" : "failure";

    const rowType: "ci_success" | "ci_failure" =
      payload.status === "success" ? "ci_success" : "ci_failure";

    await this.db
      .update(ciEvents)
      .set({
        status: rowStatus,
        type: rowType,
        payload: buildStoredPayload(payload, existingPayload),
        processed: true,
      })
      .where(eq(ciEvents.id, payload.ciEventId));

    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, event.sessionId))
      .limit(1);

    if (!session) return;

    if (!session.repoPath) return;
    const [repoOwner, repoName] = session.repoPath.split("/");
    if (!repoOwner || !repoName) return;

    const commitSha =
      typeof existingPayload.commitSha === "string" ? existingPayload.commitSha : undefined;

    try {
      const forge = await this.getForgeForSession(session);

      let sha = commitSha;
      if (!sha) {
        const branches = await forge.branches.list(repoOwner, repoName);
        const branchRow = branches.find((b) => b.name === session.branch);
        sha = branchRow?.commitSha;
      }

      if (sha) {
        const logsUrl = buildLogsUrl(session.repoPath, payload.ciEventId);
        const state: "pending" | "success" | "failure" | "error" =
          payload.status === "success"
            ? "success"
            : payload.status === "error"
              ? "error"
              : "failure";

        await forge.commits.createStatus(repoOwner, repoName, sha, {
          state,
          context: `ci/${payload.workflowName}`,
          description: buildStatusDescription(payload),
          targetUrl: logsUrl,
        });
      }
    } catch (err) {
      logger.warn("ci result: failed to post commit status", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    if (payload.status === "failure" && session.status === "running") {
      await this.enqueueAgentFixJob(session, payload);
    }
  }

  // -------------------------------------------------------------------------
  // dispatchForEvent — triggered by webhook handlers
  // -------------------------------------------------------------------------

  /**
   * Read workflow files from a repo, check trigger conditions, create ciEvent
   * rows, post pending commit statuses, and dispatch to Render Workflows.
   *
   * The forge provider must use the agent token so it has read access to
   * the workflow YAML files.
   */
  async dispatchForEvent(params: DispatchForEventParams): Promise<DispatchResult[]> {
    const { forge, repoOwner, repoName, branch, commitSha, event, sessionId } = params;
    const results: DispatchResult[] = [];

    let workflows: ParsedWorkflow[];
    try {
      workflows = await readWorkflowsFromRepo(forge, repoOwner, repoName, branch);
    } catch (err) {
      logger.warn("ci dispatch: failed to read workflows", {
        repo: `${repoOwner}/${repoName}`,
        cause: err instanceof Error ? err.message : String(err),
      });
      return results;
    }

    if (workflows.length === 0) return results;

    const triggeredWorkflows = workflows.filter((w) => shouldTrigger(w, event, branch));
    if (triggeredWorkflows.length === 0) return results;

    const cloneUrl = forge.git.authenticatedCloneUrl(repoOwner, repoName);
    const callbackUrl = buildCallbackUrl();
    const callbackSecret = process.env.CI_RUNNER_SECRET;

    for (const workflow of triggeredWorkflows) {
      const ciEventId = crypto.randomUUID();

      try {
        await this.db.insert(ciEvents).values({
          id: ciEventId,
          sessionId,
          type: "ci_running",
          workflowName: workflow.name,
          status: "running",
          payload: {
            workflow: workflow.name,
            jobs: workflow.jobs.map((j) => j.name),
            commitSha,
          },
          processed: false,
        });

        await forge.commits
          .createStatus(repoOwner, repoName, commitSha, {
            state: "pending",
            context: `ci/${workflow.name}`,
            description: "CI running via Render Workflows",
          })
          .catch((err) => {
            logger.warn("ci dispatch: failed to post pending status", {
              cause: err instanceof Error ? err.message : String(err),
            });
          });

        const input: CIJobInput = {
          ciEventId,
          repoCloneUrl: cloneUrl,
          branch,
          commitSha,
          workflowName: workflow.name,
          jobs: workflow.jobs.map((j) => ({
            name: j.name,
            steps: j.steps.map((s) => ({ name: s.name ?? s.run.slice(0, 60), run: s.run })),
          })),
          callbackUrl,
          callbackSecret: callbackSecret ?? "",
        };

        if (this.ciDispatcher) {
          const result = await this.ciDispatcher.dispatch(input);
          if (!result.ok) throw new Error(result.error);
        } else {
          await dispatchToRenderWorkflows(input as unknown as Record<string, unknown>);
        }

        results.push({ ciEventId, dispatched: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.errorWithCause(err, "ci dispatch: failed to dispatch workflow", {
          workflow: workflow.name,
        });

        await this.db
          .update(ciEvents)
          .set({
            status: "error",
            type: "ci_failure",
            payload: {
              error: msg,
              workflow: workflow.name,
              jobs: workflow.jobs.map((j) => j.name),
              commitSha,
            },
          })
          .where(eq(ciEvents.id, ciEventId))
          .catch(() => {});

        await forge.commits
          .createStatus(repoOwner, repoName, commitSha, {
            state: "error",
            context: `ci/${workflow.name}`,
            description: `Dispatch failed: ${msg.slice(0, 100)}`,
          })
          .catch(() => {});

        results.push({ ciEventId, dispatched: false, error: msg });
      }
    }

    return results;
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async enqueueAgentFixJob(
    session: typeof sessions.$inferSelect,
    payload: CIResultPayload,
  ): Promise<void> {
    const failedSteps = payload.jobs
      .flatMap((j) => j.steps.filter((s) => s.exitCode !== 0))
      .slice(0, 3);

    const failureSummary = failedSteps
      .map((s) => {
        const output = (s.stderr || s.stdout).slice(0, 500);
        return `Step "${s.name}" failed (exit ${s.exitCode}):\n${output}`;
      })
      .join("\n\n");

    const fixContext = [
      `CI workflow "${payload.workflowName}" failed.`,
      failureSummary || "No detailed output available.",
      "Review the failures above and fix the code.",
    ].join("\n\n");

    try {
      await this.enqueueSessionTriggerJob({
        sessionRow: session,
        userId: session.userId,
        trigger: "ci_failure",
        fixContext,
      });
    } catch (err) {
      logger.errorWithCause(err, "ci result: failed to enqueue fix job", {
        sessionId: session.id,
      });
    }
  }

  /**
   * Enqueue an agent job triggered by a non-user-message event.
   * Mirrors SessionService.enqueueSessionTriggerJob.
   */
  async enqueueSessionTriggerJob(params: {
    sessionRow: typeof sessions.$inferSelect;
    userId: string;
    chatTitle?: string;
    trigger: "ci_failure" | "review_comment" | "pr_opened" | "pr_merged" | "workflow_run";
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

    const runId = crypto.randomUUID();
    const effectiveModelId = modelId ?? DEFAULT_MODEL_ID;

    const forge = await this.getForgeForSession(sessionRow);
    const resolvedSkills = await this.resolveSkillsForSession(
      sessionRow,
      forge,
      sessionRow.forgeUsername ?? "",
    );

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

  private async resolveSkillsForSession(
    sessionRow: {
      repoPath: string | null;
      branch: string | null;
      activeSkills: Array<{ source: "builtin" | "user" | "repo"; slug: string }> | null | undefined;
    },
    forge: ForgeProvider,
    forgeUsername: string,
  ): Promise<ResolvedSkill[]> {
    if (forgeUsername) {
      await ensureUserSkillsRepo(forge, forgeUsername);
    }

    const [owner, repo] = (sessionRow.repoPath ?? "").split("/");
    const branch = sessionRow.branch ?? "main";
    const repoSlugs =
      owner && repo
        ? await listMdSlugsInRepoPath(forge, owner, repo, REPO_SKILLS_PATH, branch)
        : [];

    const active = normalizeActiveSkills(sessionRow.activeSkills, repoSlugs);
    const resolved = await resolveActiveSkills(forge, {
      activeSkills: active,
      forgeUsername,
      projectRepoPath: sessionRow.repoPath ?? "",
      ref: branch,
    });

    if (resolved.length === 0) {
      const fallback = getBuiltinRaw("implementation");
      if (fallback) {
        return [skillMarkdownToResolved("builtin", "implementation", fallback)];
      }
    }

    return resolved;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function buildStoredPayload(
  payload: CIResultPayload,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    status: payload.status,
    workflowName: payload.workflowName,
    totalDurationMs: payload.totalDurationMs,
    jobs: payload.jobs.map((j) => ({
      name: j.name,
      status: j.status,
      durationMs: j.durationMs,
      steps: j.steps.map((s) => ({
        name: s.name,
        exitCode: s.exitCode,
        durationMs: s.durationMs,
        stdout: s.stdout.slice(0, 10_000),
        stderr: s.stderr.slice(0, 10_000),
      })),
    })),
  };

  if (typeof existing.commitSha === "string") {
    stored.commitSha = existing.commitSha;
  }
  if (payload.testResults?.junitXml) {
    stored.junit_xml = payload.testResults.junitXml;
  }
  if (payload.testResults?.tapOutput) {
    stored.tap_output = payload.testResults.tapOutput;
  }

  return stored;
}

function buildStatusDescription(payload: CIResultPayload): string {
  if (payload.status === "success") {
    return `CI passed in ${(payload.totalDurationMs / 1000).toFixed(1)}s`;
  }
  if (payload.status === "error") {
    return "CI runner error";
  }
  const failedJob = payload.jobs.find((j) => j.status === "failure");
  const failedStep = failedJob?.steps.find((s) => s.exitCode !== 0);
  if (failedStep) {
    return `Failed: ${failedStep.name} (exit ${failedStep.exitCode})`;
  }
  return "CI failed";
}

function buildLogsUrl(repoPath: string, ciEventId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
  return `${base}/${repoPath}/actions/${ciEventId}`;
}

function buildCallbackUrl(): string {
  const base =
    process.env.CI_CALLBACK_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:4000";
  return `${base}/api/ci/results`;
}

let renderWorkflowClient: import("@renderinc/sdk").Render | null = null;

async function getRenderWorkflowClient(): Promise<import("@renderinc/sdk").Render> {
  if (!renderWorkflowClient) {
    const { Render } = await import("@renderinc/sdk");
    renderWorkflowClient = new Render();
  }
  return renderWorkflowClient;
}

async function dispatchToRenderWorkflows(input: Record<string, unknown>): Promise<void> {
  const render = await getRenderWorkflowClient();
  const workflowSlug = process.env.RENDER_CI_WORKFLOW_SLUG ?? "openforge-ci";
  await render.workflows.startTask(`${workflowSlug}/runCIJob`, [input]);
}

// ---------------------------------------------------------------------------
// Workflow parser (mirrors apps/web/lib/ci/workflow-parser.ts)
// ---------------------------------------------------------------------------

function parseWorkflowYaml(content: string, filename: string): ParsedWorkflow | null {
  let doc: Record<string, unknown>;
  try {
    doc = YAML.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!doc || typeof doc !== "object") return null;

  const name = typeof doc.name === "string" ? doc.name : filename;
  const triggers = parseTriggers(doc.on);
  const rawJobs = doc.jobs as Record<string, unknown> | undefined;
  if (!rawJobs || typeof rawJobs !== "object") return null;

  const jobs: ParsedJob[] = [];
  for (const [jobId, jobDef] of Object.entries(rawJobs)) {
    if (!jobDef || typeof jobDef !== "object") continue;
    const j = jobDef as Record<string, unknown>;
    const rawSteps = j.steps as unknown[] | undefined;
    if (!Array.isArray(rawSteps)) continue;

    const steps: ParsedStep[] = [];
    for (const rawStep of rawSteps) {
      if (!rawStep || typeof rawStep !== "object") continue;
      const s = rawStep as Record<string, unknown>;
      if (typeof s.run === "string") {
        steps.push({
          name: typeof s.name === "string" ? s.name : undefined,
          run: s.run,
          env: isStringRecord(s.env) ? s.env : undefined,
        });
      }
    }

    if (steps.length > 0) {
      jobs.push({
        name: typeof j.name === "string" ? j.name : jobId,
        steps,
        runsOn: typeof j["runs-on"] === "string" ? j["runs-on"] : undefined,
      });
    }
  }

  if (jobs.length === 0) return null;

  return { name, triggers, jobs };
}

function parseTriggers(
  on: unknown,
): { push?: { branches?: string[] }; pullRequest?: { branches?: string[] } } {
  const result: { push?: { branches?: string[] }; pullRequest?: { branches?: string[] } } = {};

  if (on === undefined || on === null || typeof on === "boolean") return result;

  if (typeof on === "string") {
    if (on === "push") result.push = {};
    if (on === "pull_request") result.pullRequest = {};
    return result;
  }

  if (Array.isArray(on)) {
    for (const t of on) {
      if (t === "push") result.push = {};
      if (t === "pull_request") result.pullRequest = {};
    }
    return result;
  }

  if (typeof on === "object") {
    const o = on as Record<string, unknown>;
    if ("push" in o) result.push = parseBranchFilter(o.push);
    if ("pull_request" in o) result.pullRequest = parseBranchFilter(o.pull_request);
  }

  return result;
}

function parseBranchFilter(val: unknown): { branches?: string[] } {
  if (!val || typeof val !== "object") return {};
  const v = val as Record<string, unknown>;
  const branches = v.branches;
  if (Array.isArray(branches)) {
    return { branches: branches.filter((b): b is string => typeof b === "string") };
  }
  return {};
}

function shouldTrigger(
  workflow: ParsedWorkflow,
  event: "push" | "pull_request",
  branch: string,
): boolean {
  const trigger = event === "push" ? workflow.triggers.push : workflow.triggers.pullRequest;
  if (!trigger) return false;
  if (!trigger.branches || trigger.branches.length === 0) return true;
  return trigger.branches.some((pattern) => {
    if (pattern === branch || pattern === "*") return true;
    if (pattern.endsWith("*") && branch.startsWith(pattern.slice(0, -1))) return true;
    return false;
  });
}

async function readWorkflowsFromRepo(
  forge: ForgeProvider,
  owner: string,
  repo: string,
  ref: string,
): Promise<ParsedWorkflow[]> {
  const workflowDir = ".forgejo/workflows";
  let entries: Array<{ name: string; path: string; type: string }>;

  try {
    const contents = await forge.files.getContents(owner, repo, workflowDir, ref);
    if (!Array.isArray(contents)) return [];
    entries = contents;
  } catch {
    return [];
  }

  const workflows: ParsedWorkflow[] = [];

  for (const entry of entries) {
    if (entry.type !== "file") continue;
    if (!entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;

    try {
      const file = await forge.files.getContents(owner, repo, entry.path, ref);
      if (Array.isArray(file) || !file.content) continue;

      const decoded =
        file.encoding === "base64"
          ? Buffer.from(file.content, "base64").toString("utf-8")
          : file.content;

      const parsed = parseWorkflowYaml(decoded, entry.name);
      if (parsed) workflows.push(parsed);
    } catch {
      // skip malformed files
    }
  }

  return workflows;
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object") return false;
  return Object.values(v as Record<string, unknown>).every((val) => typeof val === "string");
}
