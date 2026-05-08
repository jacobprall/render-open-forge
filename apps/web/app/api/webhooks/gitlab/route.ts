import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { logger } from "@render-open-forge/shared";
import { mirrors, sessions } from "@render-open-forge/db";
import { getDb } from "@/lib/db";
import { isRedisConfigured, createRedisClient } from "@/lib/redis";
import { enqueueSessionTriggerJob } from "@/lib/agent/enqueue-session-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyGitLabSignature(
  body: string,
  tokenHeader: string | null,
): boolean {
  const secret = process.env.GITLAB_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("gitlab webhook: GITLAB_WEBHOOK_SECRET not configured", {});
    return false;
  }
  if (!tokenHeader) return false;
  return crypto.timingSafeEqual(
    Buffer.from(secret),
    Buffer.from(tokenHeader),
  );
}

export async function POST(req: Request) {
  const event = req.headers.get("x-gitlab-event");
  const rawBody = await req.text();

  const tokenHeader = req.headers.get("x-gitlab-token");
  if (!verifyGitLabSignature(rawBody, tokenHeader)) {
    logger.warn("gitlab webhook: signature verification failed", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("gitlab webhook: invalid JSON", {});
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const project = payload.project as Record<string, unknown> | undefined;
  const repoFullName =
    typeof project?.path_with_namespace === "string"
      ? project.path_with_namespace
      : "";
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
    await handleNoteEvent(payload, repoFullName, httpUrl);
  }

  if (event === "Merge Request Hook") {
    await handleMergeRequestEvent(payload, repoFullName, httpUrl);
  }

  return NextResponse.json({ received: true });
}

/**
 * Handle GitLab "Note Hook" — comments on merge requests, issues, etc.
 * Maps to the same agent `review_comment` trigger as GitHub PR comments.
 */
async function handleNoteEvent(
  payload: Record<string, unknown>,
  repoFullName: string,
  httpUrl: string,
) {
  if (!repoFullName || !isRedisConfigured()) return;

  const noteableType = payload.object_attributes
    ? (payload.object_attributes as Record<string, unknown>).noteable_type
    : undefined;

  // Only process merge request comments (code review equivalent)
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

  await dispatchToMirroredSessions({
    repoFullName,
    httpUrl,
    eventLabel: "Note Hook (MR comment)",
    prNumber: mrIid,
    path: typeof attrs?.position === "object"
      ? ((attrs.position as Record<string, unknown>)?.new_path as string) ?? ""
      : "",
    body,
    auditCommentAuthor,
  });
}

/**
 * Handle GitLab "Merge Request Hook" — MR opened, merged, etc.
 * Dispatches review_comment for MR comments inline with events.
 */
async function handleMergeRequestEvent(
  payload: Record<string, unknown>,
  repoFullName: string,
  httpUrl: string,
) {
  if (!repoFullName || !isRedisConfigured()) return;

  const attrs = payload.object_attributes as Record<string, unknown> | undefined;
  const action = typeof attrs?.action === "string" ? attrs.action : "";
  const mrIid = attrs?.iid as number | undefined;

  // For now, we only trigger on "open" (for PR review agent trigger)
  if (action !== "open") return;

  const user = payload.user as Record<string, unknown> | undefined;
  const auditCommentAuthor =
    typeof user?.username === "string"
      ? user.username
      : typeof user?.name === "string"
        ? user.name
        : "";

  await dispatchToMirroredSessions({
    repoFullName,
    httpUrl,
    eventLabel: `Merge Request ${action}`,
    prNumber: mrIid,
    path: "",
    body: typeof attrs?.description === "string" ? attrs.description : "",
    auditCommentAuthor,
  });
}

// ─── Shared dispatch logic ──────────────────────────────────────────────────

interface DispatchParams {
  repoFullName: string;
  httpUrl: string;
  eventLabel: string;
  prNumber?: number;
  path: string;
  body: string;
  /** Logged for audit only; `x-gitlab-token` verification is the authorization gate. */
  auditCommentAuthor?: string;
}

/**
 * Enqueues agent jobs for mirrors matching the repo URL. GitLab webhook secret
 * verification is the authorization gate for these requests; comment author is
 * logged only for audit.
 */
async function dispatchToMirroredSessions(params: DispatchParams) {
  logger.info("gitlab webhook mirror dispatch", {
    repo: params.repoFullName,
    event: params.eventLabel,
    commentAuthor: params.auditCommentAuthor ?? "",
  });

  const db = getDb();

  // GitLab remote URLs can be stored with or without .git suffix.
  const candidates = [
    params.httpUrl,
    params.httpUrl.endsWith(".git") ? params.httpUrl.slice(0, -4) : `${params.httpUrl}.git`,
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

  const redis = createRedisClient("gitlab-webhook");

  try {
    await Promise.all(
      mirrorsWithSession.map(async (mirror) => {
        const session = mirror.sessionId ? sessionById.get(mirror.sessionId) : undefined;
        if (!session || session.status !== "running") return;

        const ctx = [
          `GitLab ${params.eventLabel} on ${params.repoFullName}${params.prNumber ? ` MR !${params.prNumber}` : ""}.`,
          params.path ? `File: ${params.path}` : "",
          params.body ? `Comment:\n${params.body}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        await enqueueSessionTriggerJob(db, redis, {
          sessionId: session.id,
          userId: session.userId,
          trigger: "review_comment",
          fixContext: ctx,
        }).catch((err) =>
          logger.errorWithCause(err, "enqueue gitlab webhook job failed", {
            sessionId: session.id,
          }),
        );
      }),
    );
  } finally {
    redis.disconnect();
  }
}
