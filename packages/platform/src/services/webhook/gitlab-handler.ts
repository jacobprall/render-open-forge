import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { mirrors, sessions } from "@openforge/db";
import { logger, ValidationError } from "@openforge/shared";
import type { WebhookDeps } from "./shared";

// ---------------------------------------------------------------------------
// GitLabWebhookHandler
// ---------------------------------------------------------------------------

export class GitLabWebhookHandler {
  constructor(private deps: WebhookDeps) {}

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

  // -------------------------------------------------------------------------
  // Private event handlers
  // -------------------------------------------------------------------------

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
    const { db, ciService } = this.deps;

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

    const matchingMirrors = await db
      .select()
      .from(mirrors)
      .where(inArray(mirrors.remoteRepoUrl, candidates));

    if (matchingMirrors.length === 0) return;

    const mirrorsWithSession = matchingMirrors.filter((m) => m.sessionId);
    const sessionIds = [...new Set(mirrorsWithSession.map((m) => m.sessionId!))];

    const sessionRows =
      sessionIds.length > 0
        ? await db.select().from(sessions).where(inArray(sessions.id, sessionIds))
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

        await ciService
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
}
