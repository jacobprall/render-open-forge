import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { logger } from "@render-open-forge/shared";
import { mirrors, sessions } from "@render-open-forge/db";
import { getDb } from "@/lib/db";
import { isRedisConfigured, createRedisClient } from "@/lib/redis";
import { enqueueSessionTriggerJob } from "@/lib/agent/enqueue-session-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const event = req.headers.get("x-github-event");
  let payload: Record<string, unknown>;

  try {
    payload = (await req.json()) as Record<string, unknown>;
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

async function handleCommentEvent(
  event: string,
  payload: Record<string, unknown>,
  repoFullName: string,
) {
  if (!repoFullName) return;
  if (!isRedisConfigured()) return;

  const action = payload.action as string | undefined;
  if (action !== "created") return;

  const db = getDb();

  const remoteUrl = `https://github.com/${repoFullName}.git`;
  const matchingMirrors = await db
    .select()
    .from(mirrors)
    .where(eq(mirrors.remoteRepoUrl, remoteUrl));

  if (matchingMirrors.length === 0) return;

  const comment = payload.comment as Record<string, unknown> | undefined;
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
        phase: "execute",
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
