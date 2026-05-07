import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { agentRuns, chats } from "@render-open-forge/db";
import {
  ensureConsumerGroup,
  readOneJob,
  ackJob,
  reclaimStalePending,
  publishRunEvent,
  type ValidatedAgentJob,
} from "@render-open-forge/shared";
import { runAgentTurn } from "./agent";
import { fetchAvailableModels } from "./models";
import { getDb } from "./db";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("REDIS_URL is required");
  process.exit(1);
}

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_RUNS ?? "5", 10);
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;
const HEARTBEAT_TTL = 30;
const RECLAIM_INTERVAL_MS = 60_000;
const STALE_PENDING_MS = 90_000;
const BLOCK_READ_MS = 5_000;
const DRAIN_TIMEOUT_MS = 60_000;

let active = 0;
let shuttingDown = false;

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.info(`[worker] Received ${sig}, draining active runs…`);
    shuttingDown = true;
  });
}

function createRedis(name: string): Redis {
  const redis = new Redis(REDIS_URL!, { enableReadyCheck: false, lazyConnect: false });
  redis.on("error", (err) => console.error(`[${name}] error:`, err));
  return redis;
}

async function heartbeat(redis: Redis): Promise<void> {
  while (!shuttingDown) {
    await redis.set(
      `worker:heartbeat:${WORKER_ID}`,
      JSON.stringify({ active, pid: process.pid, ts: Date.now() }),
      "EX",
      HEARTBEAT_TTL,
    );
    await new Promise((r) => setTimeout(r, HEARTBEAT_TTL * 1000 * 0.8));
  }
}

async function finalizeDeadLetter(redis: Redis, job: ValidatedAgentJob): Promise<void> {
  const db = getDb();
  const finishedAt = new Date();
  const [row] = await db
    .select({ startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(eq(agentRuns.id, job.runId))
    .limit(1);
  const totalDurationMs =
    row?.startedAt != null ? finishedAt.getTime() - row.startedAt.getTime() : null;

  await db
    .update(agentRuns)
    .set({ status: "failed", finishedAt, totalDurationMs })
    .where(eq(agentRuns.id, job.runId));

  await db
    .update(chats)
    .set({ activeRunId: null })
    .where(eq(chats.id, job.chatId));

  const payload = JSON.stringify({
    type: "error",
    code: "JOB_DEAD_LETTER",
    message: "Job exceeded maximum retry attempts",
    requestId: job.requestId,
    retryable: false,
  });
  await publishRunEvent(redis, job.runId, payload);
  await redis.set(`run:${job.runId}:status`, "failed", "EX", 3600);
}

async function reclaimLoop(redis: Redis): Promise<void> {
  while (!shuttingDown) {
    await new Promise((r) => setTimeout(r, RECLAIM_INTERVAL_MS));
    try {
      const { deadLetters } = await reclaimStalePending(redis, WORKER_ID, STALE_PENDING_MS);
      for (const { job } of deadLetters) {
        console.warn("[worker] Dead-letter job after max retries", {
          runId: job.runId,
          sessionId: job.sessionId,
        });
        await finalizeDeadLetter(redis, job).catch((err) =>
          console.error("[worker] Failed to finalize dead letter", err),
        );
      }
    } catch (err) {
      console.error("Reclaim loop error", err);
    }
  }
}

async function processJob(redis: Redis, streamId: string, job: ValidatedAgentJob): Promise<void> {
  const jobRedis = createRedis(`job-${job.runId}`);
  try {
    await runAgentTurn(job, jobRedis);
    await ackJob(redis, streamId);
  } catch (err) {
    console.error(`Job ${job.runId} failed`, err);
    await ackJob(redis, streamId);
  } finally {
    jobRedis.disconnect();
  }
}

async function main() {
  await fetchAvailableModels();

  const redis = createRedis("main");
  const heartbeatRedis = createRedis("heartbeat");

  await ensureConsumerGroup(redis);

  console.info(
    `[worker] Agent worker started (id: ${WORKER_ID}, maxConcurrent: ${MAX_CONCURRENT}, queue: Redis Streams)`,
  );

  void heartbeat(heartbeatRedis).catch((err) => console.error("Heartbeat failed", err));
  void reclaimLoop(redis).catch((err) => console.error("Reclaim loop failed", err));

  while (true) {
    if (shuttingDown && active === 0) break;

    if (shuttingDown) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    if (active >= MAX_CONCURRENT) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    let entry: Awaited<ReturnType<typeof readOneJob>> = null;
    try {
      entry = await readOneJob(redis, WORKER_ID, BLOCK_READ_MS);
    } catch (err) {
      console.error("readOneJob error", err);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    if (!entry) continue;

    const { streamId, job } = entry;
    console.info(`[worker] Processing job: runId=${job.runId} sessionId=${job.sessionId} phase=${job.phase}`);

    active++;
    void processJob(redis, streamId, job).finally(() => {
      active--;
    });
  }

  const drainStarted = Date.now();
  while (active > 0 && Date.now() - drainStarted < DRAIN_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (active > 0) {
    console.warn(`[worker] Drain timed out with ${active} active run(s)`);
  }

  redis.disconnect();
  heartbeatRedis.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Worker crashed", err);
  process.exit(1);
});
