import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, prEvents } from "@render-open-forge/db";
import { eq, and } from "drizzle-orm";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import { enqueueSessionTriggerJob } from "@/lib/agent/enqueue-session-job";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, userSession] = await Promise.all([params, getSession()]);
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const userId = String(userSession.userId);

  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!sessionRow.prNumber) {
    return NextResponse.json({ error: "No PR associated with this session" }, { status: 400 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "Agent queue not configured" }, { status: 503 });
  }

  const redis = createRedisClient("review-trigger");
  try {
    const [owner, repo] = sessionRow.forgejoRepoPath.split("/");
    const reviewContext = [
      `Please review pull request #${sessionRow.prNumber} on ${sessionRow.forgejoRepoPath}.`,
      `Read the full diff using pull_request_diff, then submit a thorough code review using review_pr.`,
      `Focus on: correctness, potential bugs, performance issues, security concerns, and code style.`,
      `If everything looks good, approve the PR. Otherwise, leave constructive inline comments.`,
    ].join("\n");

    const result = await enqueueSessionTriggerJob(db, redis, {
      sessionId: id,
      userId,
      trigger: "review_comment",
      fixContext: reviewContext,
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to enqueue review job" }, { status: 500 });
    }

    await db.insert(prEvents).values({
      id: crypto.randomUUID(),
      userId,
      sessionId: id,
      repoPath: sessionRow.forgejoRepoPath,
      prNumber: sessionRow.prNumber,
      action: "review_requested",
      title: sessionRow.title,
      actionNeeded: false,
      read: true,
      metadata: { runId: result.runId, triggeredBy: "user" },
    });

    return NextResponse.json({ success: true, runId: result.runId });
  } finally {
    redis.disconnect();
  }
}
