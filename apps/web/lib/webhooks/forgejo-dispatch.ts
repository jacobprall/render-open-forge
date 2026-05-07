import type Redis from "ioredis";
import { and, desc, eq, sql } from "drizzle-orm";
import { ciEvents, sessions } from "@render-open-forge/db";
import { logger } from "@render-open-forge/shared";
import type { ForgeDb } from "@/lib/db";
import { getAgentForgeProvider } from "@/lib/forgejo/client";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import { enqueueSessionTriggerJob } from "@/lib/agent/enqueue-session-job";

function repoFullName(repository: unknown): string | undefined {
  if (!repository || typeof repository !== "object") return undefined;
  const r = repository as Record<string, unknown>;
  const full =
    typeof r.full_name === "string"
      ? r.full_name
      : typeof r.fullName === "string"
        ? (r.fullName as string)
        : undefined;
  return full;
}

function branchFromPushRef(ref: unknown): string | undefined {
  if (typeof ref !== "string") return undefined;
  return ref.replace(/^refs\/heads\//, "");
}

function parseForgejoRepoPath(fullPath: string): { owner: string; repo: string } | null {
  const parts = fullPath.trim().split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  return owner && repo ? { owner, repo } : null;
}

function sessionWantsAutoMerge(projectConfig: unknown): boolean {
  if (!projectConfig || typeof projectConfig !== "object") return false;
  const c = projectConfig as Record<string, unknown>;
  return c.autoMerge === true || c.auto_merge === true;
}

async function findSessionsForRepoBranch(db: ForgeDb, repoPath: string, branch: string) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.forgejoRepoPath, repoPath), eq(sessions.branch, branch)))
    .orderBy(desc(sessions.updatedAt));
}

async function findSessionsForPr(db: ForgeDb, repoPath: string, prNumber: number) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.forgejoRepoPath, repoPath), eq(sessions.prNumber, prNumber)))
    .orderBy(desc(sessions.updatedAt));
}

export async function processForgejoWebhook(
  db: ForgeDb,
  event: string | null,
  rawBody: string,
): Promise<void> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    logger.warn("forgejo webhook: invalid JSON", {});
    return;
  }

  const redis = isRedisConfigured() ? createRedisClient("forgejo-webhook") : null;

  try {
    switch (event) {
      case "workflow_run":
        await handleWorkflowRun(db, redis, payload);
        break;
      case "pull_request":
        await handlePullRequest(db, redis, payload);
        break;
      case "push":
        await handlePush(db, payload);
        break;
      case "issue_comment":
      case "pull_request_review_comment":
        await handlePrComment(db, redis, event, payload);
        break;
      case "status":
        await handleStatus(db, payload);
        break;
      default:
        logger.info("forgejo webhook: unhandled event", { event: event ?? "" });
    }
  } finally {
    redis?.disconnect();
  }
}

async function handleWorkflowRun(db: ForgeDb, redis: Redis | null, payload: unknown) {
  const p = payload as Record<string, unknown>;
  const action = p.action;
  const wr = p.workflow_run as Record<string, unknown> | undefined;
  const repo = repoFullName(p.repository);
  if (!wr || !repo) return;
  if (action !== "completed") return;

  const branch = typeof wr.head_branch === "string" ? wr.head_branch : undefined;
  if (!branch) return;

  const conclusion = wr.conclusion as string | undefined;
  const status =
    conclusion === "success"
      ? "success"
      : conclusion === "failure"
        ? "failure"
        : conclusion === "cancelled" || conclusion === "skipped"
          ? "error"
          : "error";

  const rows = await findSessionsForRepoBranch(db, repo, branch);
  const workflowName = typeof wr.name === "string" ? wr.name : undefined;
  const runId = wr.id != null ? String(wr.id) : undefined;

  for (const s of rows) {
    const id = crypto.randomUUID();
    await db.insert(ciEvents).values({
      id,
      sessionId: s.id,
      type: status === "success" ? "ci_success" : "ci_failure",
      workflowName,
      runId,
      status: status === "success" ? "success" : "failure",
      payload: p as Record<string, unknown>,
      processed: false,
    });

    if (
      status === "success" &&
      s.prNumber != null &&
      s.prStatus === "open" &&
      sessionWantsAutoMerge(s.projectConfig) &&
      process.env.FORGEJO_AGENT_TOKEN
    ) {
      const parts = parseForgejoRepoPath(s.forgejoRepoPath);
      if (parts) {
        try {
          const forge = getAgentForgeProvider();
          await forge.pulls.merge(parts.owner, parts.repo, s.prNumber, "merge");
        } catch (err) {
          logger.warn("auto-merge after CI success failed", {
            sessionId: s.id,
            pr: s.prNumber,
            cause: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (status === "failure" && redis && s.status === "running") {
      const ctx = [
        `CI workflow "${workflowName ?? "unknown"}" failed for branch ${branch}.`,
        runId ? `Forgejo run id: ${runId}.` : "",
        "Review the Actions logs in Forgejo and fix the failure.",
      ]
        .filter(Boolean)
        .join("\n");

      await enqueueSessionTriggerJob(db, redis, {
        sessionId: s.id,
        userId: s.userId,
        trigger: "ci_failure",
        fixContext: ctx,
      }).catch((err) => logger.errorWithCause(err, "enqueue ci_failure job failed", { sessionId: s.id }));
    }
  }
}

async function handlePullRequest(db: ForgeDb, redis: Redis | null, payload: unknown) {
  const p = payload as Record<string, unknown>;
  const action = p.action as string | undefined;
  const pr = p.pull_request as Record<string, unknown> | undefined;
  const repo = repoFullName(p.repository);
  if (!pr || !repo) return;

  const number = typeof pr.number === "number" ? pr.number : Number(pr.number);
  if (!Number.isFinite(number)) return;

  const headRef = pr.head as Record<string, unknown> | undefined;
  const branch =
    headRef && typeof headRef.ref === "string" ? headRef.ref : undefined;

  const merged = Boolean(pr.merged);
  const state = pr.state as string | undefined;

  const sessionRows = branch
    ? await findSessionsForRepoBranch(db, repo, branch)
    : await findSessionsForPr(db, repo, number);

  for (const s of sessionRows) {
    if (action === "opened" || action === "reopened") {
      await db
        .update(sessions)
        .set({
          prNumber: number,
          prStatus: "open",
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, s.id));

      if (redis && action === "opened") {
        const ctx = `Pull request #${number} was opened for ${repo}. Review and continue the task as needed.`;
        await enqueueSessionTriggerJob(db, redis, {
          sessionId: s.id,
          userId: s.userId,
          trigger: "pr_opened",
          fixContext: ctx,
        }).catch((err) => logger.errorWithCause(err, "enqueue pr_opened job failed", { sessionId: s.id }));
      }
    }

    if (action === "closed") {
      const prStatus = merged ? ("merged" as const) : ("closed" as const);
      await db
        .update(sessions)
        .set({
          prStatus,
          phase: merged ? "complete" : s.phase,
          status: merged ? "completed" : s.status,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, s.id));

      const id = crypto.randomUUID();
      await db.insert(ciEvents).values({
        id,
        sessionId: s.id,
        type: merged ? "pr_merged" : "pr_closed",
        payload: p as Record<string, unknown>,
        processed: false,
      });

      if (merged && redis) {
        const ctx = `Pull request #${number} was merged. Session can be archived if work is complete.`;
        await enqueueSessionTriggerJob(db, redis, {
          sessionId: s.id,
          userId: s.userId,
          trigger: "pr_merged",
          fixContext: ctx,
        }).catch((err) => logger.errorWithCause(err, "enqueue pr_merged job failed", { sessionId: s.id }));
      }
    }
  }
}

async function handlePush(db: ForgeDb, payload: unknown) {
  const p = payload as Record<string, unknown>;
  const repo = repoFullName(p.repository);
  const ref = p.ref;
  if (!repo) return;
  const branch = branchFromPushRef(ref);
  if (!branch) return;

  // Only update the most recently active session for this repo+branch
  const rows = await findSessionsForRepoBranch(db, repo, branch);
  const s = rows[0]; // already sorted by updatedAt desc
  if (!s) return;

  // Forgejo push payloads list filenames in added/removed/modified arrays;
  // count modified files as both an add and a remove for rough approximation.
  let filesAdded = 0;
  let filesRemoved = 0;
  const commits = p.commits as unknown[] | undefined;
  if (Array.isArray(commits)) {
    for (const c of commits) {
      if (!c || typeof c !== "object") continue;
      const co = c as Record<string, unknown>;
      filesAdded += Array.isArray(co.added) ? co.added.length : 0;
      filesRemoved += Array.isArray(co.removed) ? co.removed.length : 0;
      const modified = Array.isArray(co.modified) ? co.modified.length : 0;
      filesAdded += modified;
      filesRemoved += modified;
    }
  }

  await db
    .update(sessions)
    .set({
      linesAdded: sql`${sessions.linesAdded} + ${filesAdded}`,
      linesRemoved: sql`${sessions.linesRemoved} + ${filesRemoved}`,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, s.id));
}

async function handlePrComment(
  db: ForgeDb,
  redis: Redis | null,
  event: string,
  payload: unknown,
) {
  const p = payload as Record<string, unknown>;
  const action = p.action as string | undefined;
  if (action !== "created") return;

  const issue = p.issue as Record<string, unknown> | undefined;
  const prRaw = p.pull_request as Record<string, unknown> | undefined;
  const prNumRaw = prRaw?.number ?? issue?.number;
  const prNum =
    typeof prNumRaw === "number" ? prNumRaw : Number(prNumRaw ?? Number.NaN);

  const body =
    typeof p.comment === "object" && p.comment !== null
      ? String((p.comment as Record<string, unknown>).body ?? "")
      : "";

  const repo = repoFullName(p.repository);
  if (!repo || !Number.isFinite(prNum)) return;
  if (!redis) return;

  // Only trigger the most recently active session for this PR
  const rows = await findSessionsForPr(db, repo, prNum);
  const s = rows[0]; // already sorted by updatedAt desc
  if (!s) return;

  const path =
    event === "pull_request_review_comment"
      ? String((p.comment as Record<string, unknown>)?.path ?? "")
      : "";

  const ctx = [
    `New review activity on PR #${prNum} (${event}).`,
    path ? `File: ${path}` : "",
    body ? `Comment:\n${body}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  await enqueueSessionTriggerJob(db, redis, {
    sessionId: s.id,
    userId: s.userId,
    trigger: "review_comment",
    fixContext: ctx,
  }).catch((err) =>
    logger.errorWithCause(err, "enqueue review_comment job failed", { sessionId: s.id }),
  );
}

async function handleStatus(db: ForgeDb, payload: unknown) {
  const p = payload as Record<string, unknown>;
  const state = typeof p.state === "string" ? p.state.toLowerCase() : "";
  const sha = typeof p.sha === "string" ? p.sha : "";
  const repo = repoFullName(p.repository);
  if (!repo || !sha) return;

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.forgejoRepoPath, repo))
    .orderBy(desc(sessions.updatedAt))
    .limit(10);

  const status =
    state === "success" ? ("success" as const) : state === "pending" ? ("running" as const) : ("failure" as const);

  for (const s of rows) {
    await db.insert(ciEvents).values({
      id: crypto.randomUUID(),
      sessionId: s.id,
      type: status === "success" ? "ci_success" : "ci_failure",
      status,
      payload: {
        ...(p as Record<string, unknown>),
        context: p.context,
        target_url: p.target_url,
        sha,
      },
      processed: false,
    });
  }
}
