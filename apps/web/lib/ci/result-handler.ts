import { and, eq } from "drizzle-orm";
import { ciEvents, sessions, syncConnections } from "@openforge/db";
import { logger } from "@openforge/shared";
import type { ForgeProviderType } from "@openforge/platform/forge";
import type { ForgeDb } from "@/lib/db";
import { createForgeProvider, getAgentForgeProvider } from "@/lib/forge/client";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import { enqueueSessionTriggerJob } from "@/lib/agent/enqueue-session-job";
import type { CIResultPayload } from "./ci-result-schema";

export type { CIResultPayload } from "./ci-result-schema";

/**
 * Process a CI result callback from the Render Workflows task runner.
 * Updates the ci_events row, posts a commit status to Forgejo,
 * and enqueues an agent fix job on failure.
 */
export async function handleCIResult(
  db: ForgeDb,
  payload: CIResultPayload,
): Promise<void> {
  const [event] = await db
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

  let rowStatus: "success" | "failure" | "error";
  let rowType: "ci_success" | "ci_failure";

  if (payload.status === "success") {
    rowStatus = "success";
    rowType = "ci_success";
  } else if (payload.status === "error") {
    rowStatus = "error";
    rowType = "ci_failure";
  } else {
    rowStatus = "failure";
    rowType = "ci_failure";
  }

  await db
    .update(ciEvents)
    .set({
      status: rowStatus,
      type: rowType,
      payload: buildStoredPayload(payload, existingPayload),
      processed: true,
    })
    .where(eq(ciEvents.id, payload.ciEventId));

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, event.sessionId))
    .limit(1);

  if (!session) return;

  const repoPath = session.repoPath;
  if (!repoPath) return;
  const [repoOwner, repoName] = repoPath.split("/");
  if (!repoOwner || !repoName) return;

  const commitSha =
    typeof existingPayload.commitSha === "string"
      ? existingPayload.commitSha
      : undefined;

  try {
    const forgeType = (session.forgeType ?? "github") as ForgeProviderType;
    let forge;
    if (forgeType === "forgejo") {
      forge = getAgentForgeProvider();
    } else {
      const [conn] = await db
        .select({ accessToken: syncConnections.accessToken })
        .from(syncConnections)
        .where(and(eq(syncConnections.userId, session.userId), eq(syncConnections.provider, forgeType)))
        .limit(1);
      forge = conn?.accessToken
        ? createForgeProvider(conn.accessToken, forgeType)
        : getAgentForgeProvider();
    }

    let sha = commitSha;
    if (!sha) {
      const latestBranch = session.branch;
      const branches = await forge.branches.list(repoOwner, repoName);
      const branchRow = branches.find((b) => b.name === latestBranch);
      sha = branchRow?.commitSha;
    }

    if (sha) {
      const logsUrl = buildLogsUrl(repoPath, payload.ciEventId);

      const state: "pending" | "success" | "failure" | "error" =
        payload.status === "success" ? "success" : payload.status === "error" ? "error" : "failure";

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
    await enqueueAgentFixJob(db, session, payload);
  }
}

async function enqueueAgentFixJob(
  db: ForgeDb,
  session: typeof sessions.$inferSelect,
  payload: CIResultPayload,
): Promise<void> {
  if (!isRedisConfigured()) return;

  const redis = createRedisClient("ci-result");
  try {
    const failedSteps = payload.jobs
      .flatMap((j) => j.steps.filter((s) => s.exitCode !== 0))
      .slice(0, 3);

    const failureSummary = failedSteps
      .map((s) => {
        const output = (s.stderr || s.stdout).slice(0, 500);
        return `Step "${s.name}" failed (exit ${s.exitCode}):\n${output}`;
      })
      .join("\n\n");

    const ctx = [
      `CI workflow "${payload.workflowName}" failed.`,
      failureSummary || "No detailed output available.",
      "Review the failures above and fix the code.",
    ].join("\n\n");

    await enqueueSessionTriggerJob(db, redis, {
      sessionId: session.id,
      userId: session.userId,
      trigger: "ci_failure",
      fixContext: ctx,
    });
  } catch (err) {
    logger.errorWithCause(err, "ci result: failed to enqueue fix job", {
      sessionId: session.id,
    });
  } finally {
    redis.disconnect();
  }
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
