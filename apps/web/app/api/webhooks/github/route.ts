import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { logger } from "@render-open-forge/shared";
import { mirrors, sessions } from "@render-open-forge/db";
import { getDb } from "@/lib/db";
import { isRedisConfigured, createRedisClient } from "@/lib/redis";
import { enqueueSessionTriggerJob } from "@/lib/agent/enqueue-session-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("github webhook: GITHUB_WEBHOOK_SECRET not configured", {});
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature256 = req.headers.get("x-hub-signature-256");
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  if (
    !signature256 ||
    signature256.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature256))
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("github webhook: invalid JSON", {});
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repo = payload.repository as Record<string, unknown> | undefined;
  const repoFullName = typeof repo?.full_name === "string" ? repo.full_name : "";

  logger.info("github webhook received", {
    event: event ?? "",
    repo: repoFullName,
    action: typeof payload.action === "string" ? payload.action : "",
  });

  if (event === "pull_request_review_comment" || event === "issue_comment") {
    await handleCommentEvent(event, payload, repoFullName);
  }

  return NextResponse.json({ received: true });
}

/**
 * Dispatches agent triggers for new PR/issue comments. Valid webhook HMAC
 * verification is the authorization gate for these requests; comment author is
 * logged only for audit.
 */
async function handleCommentEvent(
  event: string,
  payload: Record<string, unknown>,
  repoFullName: string,
) {
  if (!repoFullName) return;
  if (!isRedisConfigured()) return;

  const action = payload.action as string | undefined;
  if (action !== "created") return;

  const comment = payload.comment as Record<string, unknown> | undefined;
  const commentUser = comment?.user as Record<string, unknown> | undefined;
  const commentAuthor =
    typeof commentUser?.login === "string" ? commentUser.login : "";

  logger.info("github webhook comment event", {
    repo: repoFullName,
    event,
    commentAuthor,
  });

  const db = getDb();

  const remoteUrl = `https://github.com/${repoFullName}.git`;
  const matchingMirrors = await db
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

  const redis = createRedisClient("github-webhook");

  try {
    for (const mirror of matchingMirrors) {
      if (!mirror.sessionId) continue;

      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, mirror.sessionId))
        .limit(1);

      if (!session || session.status !== "running") continue;

      const ctx = [
        `GitHub ${event} on ${repoFullName}${prNumber ? ` PR #${prNumber}` : ""}.`,
        path ? `File: ${path}` : "",
        body ? `Comment:\n${body}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      await enqueueSessionTriggerJob(db, redis, {
        sessionId: session.id,
        userId: session.userId,
        trigger: "review_comment",
        fixContext: ctx,
      }).catch((err) =>
        logger.errorWithCause(err, "enqueue github webhook job failed", {
          sessionId: session.id,
        }),
      );
    }
  } finally {
    redis.disconnect();
  }
}
