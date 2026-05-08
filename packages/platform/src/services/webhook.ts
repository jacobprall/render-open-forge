import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ciEvents, mirrors, prEvents, sessions } from "@openforge/db";
import { logger, ValidationError } from "@openforge/shared";
import type { PlatformDb } from "../interfaces/database";
import type { QueueAdapter } from "../interfaces/queue";
import type { EventBus } from "../interfaces/events";
import { getDefaultForgeProvider } from "../forge/factory";
import type { ForgeProvider } from "../forge/provider";
import {
  verifyForgejoWebhookSignature,
  isForgejoWebhookVerificationConfigured,
  shouldAllowUnsignedForgejoWebhooks,
} from "../forgejo/webhook-signature";
import type { CIService } from "./ci";

// ---------------------------------------------------------------------------
// WebhookService
// ---------------------------------------------------------------------------

export class WebhookService {
  constructor(
    private db: PlatformDb,
    private queue: QueueAdapter,
    private events: EventBus,
    private ciService: CIService,
  ) {}

  // -------------------------------------------------------------------------
  // handleForgejoWebhook — POST /api/webhooks/forgejo
  // -------------------------------------------------------------------------

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

    // The event type is passed separately — callers extract it from the header
    // before invoking this method. We re-parse it from a combined envelope if
    // needed. Callers should pass event as the second arg; for backward compat
    // the body may embed it, but we expect it separately via handleForgejoEvent.
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
  // handleGithubWebhook — POST /api/webhooks/github
  // -------------------------------------------------------------------------

  /**
   * Verify GitHub HMAC signature and process comment events that correspond
   * to mirrored repositories, enqueueing agent session trigger jobs.
   */
  async handleGithubWebhook(rawBody: string, signature: string | null): Promise<void> {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new ValidationError("GITHUB_WEBHOOK_SECRET not configured");
    }

    const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;

    if (
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) {
      throw new ValidationError("Invalid GitHub webhook signature");
    }
  }

  /**
   * Process a pre-verified GitHub webhook event and body.
   */
  async handleGithubEvent(event: string | null, rawBody: string): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      logger.warn("github webhook: invalid JSON", {});
      return;
    }

    const repo = payload.repository as Record<string, unknown> | undefined;
    const repoFullName = typeof repo?.full_name === "string" ? repo.full_name : "";

    logger.info("github webhook received", {
      event: event ?? "",
      repo: repoFullName,
      action: typeof payload.action === "string" ? payload.action : "",
    });

    if (event === "pull_request_review_comment" || event === "issue_comment") {
      await this.handleGithubCommentEvent(event, payload, repoFullName);
    }
  }

  // -------------------------------------------------------------------------
  // handleGitlabWebhook — POST /api/webhooks/gitlab
  // -------------------------------------------------------------------------

  /**
   * Verify GitLab webhook token and process note/merge-request events for
   * mirrored repositories.
   */
  async handleGitlabWebhook(rawBody: string, token: string | null): Promise<void> {
    const secret = process.env.GITLAB_WEBHOOK_SECRET;
    if (!secret) {
      throw new ValidationError("GITLAB_WEBHOOK_SECRET not configured");
    }
    if (!token) {
      throw new ValidationError("Missing x-gitlab-token header");
    }
    if (
      secret.length !== token.length ||
      !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(token))
    ) {
      throw new ValidationError("Invalid GitLab webhook token");
    }
  }

  /**
   * Process a pre-verified GitLab webhook event and body.
   */
  async handleGitlabEvent(event: string | null, rawBody: string): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      logger.warn("gitlab webhook: invalid JSON", {});
      return;
    }

    const project = payload.project as Record<string, unknown> | undefined;
    const repoFullName =
      typeof project?.path_with_namespace === "string" ? project.path_with_namespace : "";
    const httpUrl =
      typeof project?.http_url === "string"
        ? project.http_url
        : typeof project?.git_http_url === "string"
          ? (project.git_http_url as string)
          : "";

    logger.info("gitlab webhook received", {
      event: event ?? "",
      repo: repoFullName,
      action: typeof payload.event_type === "string" ? payload.event_type : "",
    });

    if (event === "Note Hook") {
      await this.handleGitlabNoteEvent(payload, repoFullName, httpUrl);
    }

    if (event === "Merge Request Hook") {
      await this.handleGitlabMergeRequestEvent(payload, repoFullName, httpUrl);
    }
  }

  // =========================================================================
  // Forgejo event handlers
  // =========================================================================

  private async handleWorkflowRun(forge: ForgeProvider, payload: unknown): Promise<void> {
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

    const rows = await this.findSessionsForRepoBranch(repo, branch);
    const workflowName = typeof wr.name === "string" ? wr.name : undefined;
    const runId = wr.id != null ? String(wr.id) : undefined;

    for (const s of rows) {
      await this.db.insert(ciEvents).values({
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
        await this.db.insert(prEvents).values({
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
        const parts = parseForgejoRepoPath(s.forgejoRepoPath);
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

        await this.ciService
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

  private async handlePullRequest(forge: ForgeProvider, payload: unknown): Promise<void> {
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
      ? await this.findSessionsForRepoBranch(repo, branch)
      : await this.findSessionsForPr(repo, number);

    for (const s of sessionRows) {
      if (action === "opened" || action === "reopened") {
        await this.db
          .update(sessions)
          .set({ prNumber: number, prStatus: "open", updatedAt: new Date() })
          .where(eq(sessions.id, s.id));

        await this.db.insert(prEvents).values({
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
          await this.ciService
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

      if ((action === "opened" || action === "synchronized") && branch) {
        const headSha =
          headRef && typeof headRef.sha === "string" ? headRef.sha : "";
        if (headSha) {
          const parts = parseForgejoRepoPath(repo);
          if (parts) {
            this.ciService
              .dispatchForEvent({
                forge,
                repoOwner: parts.owner,
                repoName: parts.repo,
                branch,
                commitSha: headSha,
                event: "pull_request",
                sessionId: s.id,
              })
              .catch((err) =>
                logger.errorWithCause(err, "ci dispatch on PR failed", { repo, pr: number }),
              );
          }
        }
      }

      if (action === "closed") {
        const prStatus = merged ? ("merged" as const) : ("closed" as const);
        await this.db
          .update(sessions)
          .set({
            prStatus,
            phase: merged ? "complete" : s.phase,
            status: merged ? "completed" : s.status,
            updatedAt: new Date(),
          })
          .where(eq(sessions.id, s.id));

        await this.db.insert(ciEvents).values({
          id: crypto.randomUUID(),
          sessionId: s.id,
          type: merged ? "pr_merged" : "pr_closed",
          payload: p as Record<string, unknown>,
          processed: false,
        });

        await this.db.insert(prEvents).values({
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
          await this.ciService
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

  private async handlePush(forge: ForgeProvider, payload: unknown): Promise<void> {
    const p = payload as Record<string, unknown>;
    const repo = repoFullName(p.repository);
    const ref = p.ref;
    if (!repo) return;

    const branch = branchFromPushRef(ref);
    if (!branch) return;

    const rows = await this.findSessionsForRepoBranch(repo, branch);
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

    await this.db
      .update(sessions)
      .set({
        linesAdded: sql`${sessions.linesAdded} + ${filesAdded}`,
        linesRemoved: sql`${sessions.linesRemoved} + ${filesRemoved}`,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, s.id));

    const parts = parseForgejoRepoPath(repo);
    if (parts) {
      const after = typeof p.after === "string" ? p.after : "";
      if (after && after !== "0000000000000000000000000000000000000000") {
        this.ciService
          .dispatchForEvent({
            forge,
            repoOwner: parts.owner,
            repoName: parts.repo,
            branch,
            commitSha: after,
            event: "push",
            sessionId: s.id,
          })
          .catch((err) =>
            logger.errorWithCause(err, "ci dispatch on push failed", { repo, branch }),
          );
      }
    }
  }

  private async handlePrComment(event: string, payload: unknown): Promise<void> {
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

    const rows = await this.findSessionsForPr(repo, prNum);
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

    await this.db.insert(prEvents).values({
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

    await this.ciService
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
    const p = payload as Record<string, unknown>;
    const ctx = typeof p.context === "string" ? p.context : "";
    if (ctx.startsWith("ci/")) return;

    const state = typeof p.state === "string" ? p.state.toLowerCase() : "";
    const sha = typeof p.sha === "string" ? p.sha : "";
    const repo = repoFullName(p.repository);
    if (!repo || !sha) return;

    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.forgejoRepoPath, repo))
      .orderBy(desc(sessions.updatedAt))
      .limit(10);

    const status: "success" | "running" | "failure" =
      state === "success" ? "success" : state === "pending" ? "running" : "failure";

    for (const s of rows) {
      await this.db.insert(ciEvents).values({
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

  // =========================================================================
  // GitHub event handlers
  // =========================================================================

  private async handleGithubCommentEvent(
    event: string,
    payload: Record<string, unknown>,
    repoFullNameStr: string,
  ): Promise<void> {
    if (!repoFullNameStr) return;

    const action = payload.action as string | undefined;
    if (action !== "created") return;

    const comment = payload.comment as Record<string, unknown> | undefined;
    const commentUser = comment?.user as Record<string, unknown> | undefined;
    const commentAuthor =
      typeof commentUser?.login === "string" ? commentUser.login : "";

    logger.info("github webhook comment event", {
      repo: repoFullNameStr,
      event,
      commentAuthor,
    });

    const remoteUrl = `https://github.com/${repoFullNameStr}.git`;
    const matchingMirrors = await this.db
      .select()
      .from(mirrors)
      .where(eq(mirrors.remoteRepoUrl, remoteUrl));

    if (matchingMirrors.length === 0) return;

    const body = typeof comment?.body === "string" ? comment.body : "";

    const issue = payload.issue as Record<string, unknown> | undefined;
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    const prNumber = pr?.number ?? issue?.number;

    const path =
      event === "pull_request_review_comment" && typeof comment?.path === "string"
        ? comment.path
        : "";

    for (const mirror of matchingMirrors) {
      if (!mirror.sessionId) continue;

      const [session] = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, mirror.sessionId))
        .limit(1);

      if (!session || session.status !== "running") continue;

      const fixContext = [
        `GitHub ${event} on ${repoFullNameStr}${prNumber ? ` PR #${prNumber}` : ""}.`,
        path ? `File: ${path}` : "",
        body ? `Comment:\n${body}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      await this.ciService
        .enqueueSessionTriggerJob({
          sessionRow: session,
          userId: session.userId,
          trigger: "review_comment",
          fixContext,
        })
        .catch((err) =>
          logger.errorWithCause(err, "enqueue github webhook job failed", {
            sessionId: session.id,
          }),
        );
    }
  }

  // =========================================================================
  // GitLab event handlers
  // =========================================================================

  private async handleGitlabNoteEvent(
    payload: Record<string, unknown>,
    repoFullNameStr: string,
    httpUrl: string,
  ): Promise<void> {
    if (!repoFullNameStr) return;

    const noteableType = payload.object_attributes
      ? (payload.object_attributes as Record<string, unknown>).noteable_type
      : undefined;

    if (noteableType !== "MergeRequest") return;

    const attrs = payload.object_attributes as Record<string, unknown>;
    const body = typeof attrs?.note === "string" ? attrs.note : "";
    const mr = payload.merge_request as Record<string, unknown> | undefined;
    const mrIid = mr?.iid as number | undefined;

    const user = payload.user as Record<string, unknown> | undefined;
    const auditCommentAuthor =
      typeof user?.username === "string"
        ? user.username
        : typeof user?.name === "string"
          ? user.name
          : "";

    await this.dispatchToGitlabMirroredSessions({
      repoFullName: repoFullNameStr,
      httpUrl,
      eventLabel: "Note Hook (MR comment)",
      prNumber: mrIid,
      path:
        typeof attrs?.position === "object"
          ? ((attrs.position as Record<string, unknown>)?.new_path as string) ?? ""
          : "",
      body,
      auditCommentAuthor,
    });
  }

  private async handleGitlabMergeRequestEvent(
    payload: Record<string, unknown>,
    repoFullNameStr: string,
    httpUrl: string,
  ): Promise<void> {
    if (!repoFullNameStr) return;

    const attrs = payload.object_attributes as Record<string, unknown> | undefined;
    const action = typeof attrs?.action === "string" ? attrs.action : "";
    const mrIid = attrs?.iid as number | undefined;

    if (action !== "open") return;

    const user = payload.user as Record<string, unknown> | undefined;
    const auditCommentAuthor =
      typeof user?.username === "string"
        ? user.username
        : typeof user?.name === "string"
          ? user.name
          : "";

    await this.dispatchToGitlabMirroredSessions({
      repoFullName: repoFullNameStr,
      httpUrl,
      eventLabel: `Merge Request ${action}`,
      prNumber: mrIid,
      path: "",
      body: typeof attrs?.description === "string" ? attrs.description : "",
      auditCommentAuthor,
    });
  }

  private async dispatchToGitlabMirroredSessions(params: {
    repoFullName: string;
    httpUrl: string;
    eventLabel: string;
    prNumber?: number;
    path: string;
    body: string;
    auditCommentAuthor?: string;
  }): Promise<void> {
    logger.info("gitlab webhook mirror dispatch", {
      repo: params.repoFullName,
      event: params.eventLabel,
      commentAuthor: params.auditCommentAuthor ?? "",
    });

    const candidates = [
      params.httpUrl,
      params.httpUrl.endsWith(".git")
        ? params.httpUrl.slice(0, -4)
        : `${params.httpUrl}.git`,
    ].filter(Boolean);

    if (candidates.length === 0) return;

    const matchingMirrors = await this.db
      .select()
      .from(mirrors)
      .where(inArray(mirrors.remoteRepoUrl, candidates));

    if (matchingMirrors.length === 0) return;

    const mirrorsWithSession = matchingMirrors.filter((m) => m.sessionId);
    const sessionIds = [...new Set(mirrorsWithSession.map((m) => m.sessionId!))];

    const sessionRows =
      sessionIds.length > 0
        ? await this.db.select().from(sessions).where(inArray(sessions.id, sessionIds))
        : [];

    const sessionById = new Map(sessionRows.map((s) => [s.id, s]));

    await Promise.all(
      mirrorsWithSession.map(async (mirror) => {
        const session = mirror.sessionId ? sessionById.get(mirror.sessionId) : undefined;
        if (!session || session.status !== "running") return;

        const fixContext = [
          `GitLab ${params.eventLabel} on ${params.repoFullName}${params.prNumber ? ` MR !${params.prNumber}` : ""}.`,
          params.path ? `File: ${params.path}` : "",
          params.body ? `Comment:\n${params.body}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        await this.ciService
          .enqueueSessionTriggerJob({
            sessionRow: session,
            userId: session.userId,
            trigger: "review_comment",
            fixContext,
          })
          .catch((err) =>
            logger.errorWithCause(err, "enqueue gitlab webhook job failed", {
              sessionId: session.id,
            }),
          );
      }),
    );
  }

  // =========================================================================
  // DB query helpers
  // =========================================================================

  private findSessionsForRepoBranch(repoPath: string, branch: string) {
    return this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.forgejoRepoPath, repoPath), eq(sessions.branch, branch)))
      .orderBy(desc(sessions.updatedAt));
  }

  private findSessionsForPr(repoPath: string, prNumber: number) {
    return this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.forgejoRepoPath, repoPath), eq(sessions.prNumber, prNumber)))
      .orderBy(desc(sessions.updatedAt));
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

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
