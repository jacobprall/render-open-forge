import crypto from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { ciEvents, prEvents, sessions } from "@openforge/db";
import { logger, ValidationError } from "@openforge/shared";
import { getDefaultForgeProvider } from "../../forge/factory";
import type { ForgeProvider } from "../../forge/provider";
import {
  verifyForgejoWebhookSignature,
  isForgejoWebhookVerificationConfigured,
  shouldAllowUnsignedForgejoWebhooks,
} from "../../forgejo/webhook-signature";
import type { WebhookDeps } from "./shared";
import {
  findSessionsForRepoBranch,
  findSessionsForPr,
  repoFullName,
  branchFromPushRef,
  parseRepoPath,
  sessionWantsAutoMerge,
} from "./shared";

// ---------------------------------------------------------------------------
// ForgejoWebhookHandler
// ---------------------------------------------------------------------------

export class ForgejoWebhookHandler {
  constructor(private deps: WebhookDeps) {}

  /**
   * Verify the Forgejo webhook signature and dispatch the event to the
   * appropriate handler (push, pull_request, workflow_run, issue_comment, status).
   */
  async handleForgejoWebhook(rawBody: string, signature: string | null): Promise<void> {
    if (isForgejoWebhookVerificationConfigured()) {
      const secret = process.env.FORGEJO_WEBHOOK_SECRET ?? "";
      if (!verifyForgejoWebhookSignature(rawBody, signature, null, secret)) {
        throw new ValidationError("Invalid Forgejo webhook signature");
      }
    } else if (!shouldAllowUnsignedForgejoWebhooks()) {
      throw new ValidationError("Forgejo webhook verification not configured");
    }
  }

  /**
   * Process a pre-verified Forgejo webhook body with a known event type.
   * Split from handleForgejoWebhook so routes can pass the header value directly.
   */
  async handleForgejoEvent(event: string | null, rawBody: string): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      logger.warn("forgejo webhook: invalid JSON", {});
      return;
    }

    const forge = getDefaultForgeProvider(process.env.FORGEJO_AGENT_TOKEN ?? "");

    switch (event) {
      case "workflow_run":
        await this.handleWorkflowRun(forge, payload);
        break;
      case "pull_request":
        await this.handlePullRequest(forge, payload);
        break;
      case "push":
        await this.handlePush(forge, payload);
        break;
      case "issue_comment":
      case "pull_request_review_comment":
        await this.handlePrComment(event, payload);
        break;
      case "status":
        await this.handleStatus(payload);
        break;
      default:
        logger.info("forgejo webhook: unhandled event", { event: event ?? "" });
    }
  }

  // -------------------------------------------------------------------------
  // Private event handlers
  // -------------------------------------------------------------------------

  private async handleWorkflowRun(forge: ForgeProvider, payload: unknown): Promise<void> {
    const { db, ciService } = this.deps;
    const p = payload as Record<string, unknown>;
    const action = p.action;
    const wr = p.workflow_run as Record<string, unknown> | undefined;
    const repo = repoFullName(p.repository);
    if (!wr || !repo) return;
    if (action !== "completed") return;

    const branch = typeof wr.head_branch === "string" ? wr.head_branch : undefined;
    if (!branch) return;

    const conclusion = wr.conclusion as string | undefined;
    const status: "success" | "failure" | "error" =
      conclusion === "success"
        ? "success"
        : conclusion === "failure"
          ? "failure"
          : "error";

    const rows = await findSessionsForRepoBranch(db, repo, branch);
    const workflowName = typeof wr.name === "string" ? wr.name : undefined;
    const runId = wr.id != null ? String(wr.id) : undefined;

    for (const s of rows) {
      await db.insert(ciEvents).values({
        id: crypto.randomUUID(),
        sessionId: s.id,
        type: status === "success" ? "ci_success" : "ci_failure",
        workflowName,
        runId,
        status: status === "success" ? "success" : "failure",
        payload: p as Record<string, unknown>,
        processed: false,
      });

      if (s.prNumber != null && s.prStatus === "open") {
        await db.insert(prEvents).values({
          id: crypto.randomUUID(),
          userId: s.userId,
          sessionId: s.id,
          repoPath: repo,
          prNumber: s.prNumber,
          action: status === "success" ? "ci_passed" : "ci_failed",
          title: s.title,
          actionNeeded: status === "success",
          metadata: { workflowName, runId, conclusion: status },
        });
      }

      if (
        status === "success" &&
        s.prNumber != null &&
        s.prStatus === "open" &&
        sessionWantsAutoMerge(s.projectConfig) &&
        process.env.FORGEJO_AGENT_TOKEN
      ) {
        const parts = s.repoPath ? parseRepoPath(s.repoPath) : null;
        if (parts) {
          try {
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

      if (status === "failure" && s.status === "running") {
        const fixContext = [
          `CI workflow "${workflowName ?? "unknown"}" failed for branch ${branch}.`,
          runId ? `Forgejo run id: ${runId}.` : "",
          "Review the Actions logs in Forgejo and fix the failure.",
        ]
          .filter(Boolean)
          .join("\n");

        await ciService
          .enqueueSessionTriggerJob({
            sessionRow: s,
            userId: s.userId,
            trigger: "ci_failure",
            fixContext,
          })
          .catch((err) =>
            logger.errorWithCause(err, "enqueue ci_failure job failed", { sessionId: s.id }),
          );
      }
    }
  }

  private async handlePullRequest(_forge: ForgeProvider, payload: unknown): Promise<void> {
    const { db, ciService } = this.deps;
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
    const prTitle = typeof pr.title === "string" ? pr.title : undefined;

    const sessionRows = branch
      ? await findSessionsForRepoBranch(db, repo, branch)
      : await findSessionsForPr(db, repo, number);

    for (const s of sessionRows) {
      if (action === "opened" || action === "reopened") {
        await db
          .update(sessions)
          .set({ prNumber: number, prStatus: "open", updatedAt: new Date() })
          .where(eq(sessions.id, s.id));

        await db.insert(prEvents).values({
          id: crypto.randomUUID(),
          userId: s.userId,
          sessionId: s.id,
          repoPath: repo,
          prNumber: number,
          action: "opened",
          title: prTitle ?? s.title,
          actionNeeded: true,
          metadata: {
            headRef: branch,
            author: (pr.user as Record<string, unknown>)?.login ?? null,
          },
        });

        if (action === "opened") {
          const fixContext = `Pull request #${number} was opened for ${repo}. Review and continue the task as needed.`;
          await ciService
            .enqueueSessionTriggerJob({
              sessionRow: s,
              userId: s.userId,
              trigger: "pr_opened",
              fixContext,
            })
            .catch((err) =>
              logger.errorWithCause(err, "enqueue pr_opened job failed", { sessionId: s.id }),
            );
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

        await db.insert(ciEvents).values({
          id: crypto.randomUUID(),
          sessionId: s.id,
          type: merged ? "pr_merged" : "pr_closed",
          payload: p as Record<string, unknown>,
          processed: false,
        });

        await db.insert(prEvents).values({
          id: crypto.randomUUID(),
          userId: s.userId,
          sessionId: s.id,
          repoPath: repo,
          prNumber: number,
          action: merged ? "merged" : "closed",
          title: prTitle ?? s.title,
          actionNeeded: false,
        });

        if (merged) {
          const fixContext = `Pull request #${number} was merged. Session can be archived if work is complete.`;
          await ciService
            .enqueueSessionTriggerJob({
              sessionRow: s,
              userId: s.userId,
              trigger: "pr_merged",
              fixContext,
            })
            .catch((err) =>
              logger.errorWithCause(err, "enqueue pr_merged job failed", { sessionId: s.id }),
            );
        }
      }
    }
  }

  private async handlePush(_forge: ForgeProvider, payload: unknown): Promise<void> {
    const { db } = this.deps;
    const p = payload as Record<string, unknown>;
    const repo = repoFullName(p.repository);
    const ref = p.ref;
    if (!repo) return;

    const branch = branchFromPushRef(ref);
    if (!branch) return;

    const rows = await findSessionsForRepoBranch(db, repo, branch);
    const s = rows[0];
    if (!s) return;

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

  private async handlePrComment(event: string, payload: unknown): Promise<void> {
    const { db, ciService } = this.deps;
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

    const rows = await findSessionsForPr(db, repo, prNum);
    const s = rows[0];
    if (!s) return;

    const path =
      event === "pull_request_review_comment"
        ? String((p.comment as Record<string, unknown>)?.path ?? "")
        : "";

    const fixContext = [
      `New review activity on PR #${prNum} (${event}).`,
      path ? `File: ${path}` : "",
      body ? `Comment:\n${body}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    await db.insert(prEvents).values({
      id: crypto.randomUUID(),
      userId: s.userId,
      sessionId: s.id,
      repoPath: repo,
      prNumber: prNum,
      action: "commented",
      title: s.title,
      actionNeeded: true,
      metadata: { commentBody: body.slice(0, 500), path: path || undefined },
    });

    await ciService
      .enqueueSessionTriggerJob({
        sessionRow: s,
        userId: s.userId,
        trigger: "review_comment",
        fixContext,
      })
      .catch((err) =>
        logger.errorWithCause(err, "enqueue review_comment job failed", { sessionId: s.id }),
      );
  }

  private async handleStatus(payload: unknown): Promise<void> {
    const { db } = this.deps;
    const p = payload as Record<string, unknown>;
    const ctx = typeof p.context === "string" ? p.context : "";
    if (ctx.startsWith("ci/")) return;

    const state = typeof p.state === "string" ? p.state.toLowerCase() : "";
    const sha = typeof p.sha === "string" ? p.sha : "";
    const repo = repoFullName(p.repository);
    if (!repo || !sha) return;

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.repoPath, repo))
      .orderBy(desc(sessions.updatedAt))
      .limit(10);

    const status: "success" | "running" | "failure" =
      state === "success" ? "success" : state === "pending" ? "running" : "failure";

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
}
