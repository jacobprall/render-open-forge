import type Redis from "ioredis";
import { RedisStreamError } from "./errors";

const STREAM_FIELD = "e";
const STREAM_MAXLEN = "2000";

function parseStreamEntries(entries: [string, string[]][] | null | undefined): {
  id: string;
  payload: string;
}[] {
  if (!entries?.length) return [];
  const out: { id: string; payload: string }[] = [];
  for (const [id, fields] of entries) {
    for (let i = 0; i < fields.length - 1; i += 2) {
      if (fields[i] === STREAM_FIELD) {
        out.push({ id, payload: fields[i + 1]! });
        break;
      }
    }
  }
  return out;
}

export function runEventStreamKey(runId: string): string {
  return `run:${runId}:events`;
}

export async function publishRunEvent(
  redis: Redis,
  runId: string,
  payloadJson: string,
): Promise<void> {
  const key = runEventStreamKey(runId);
  try {
    await redis.xadd(key, "MAXLEN", "~", STREAM_MAXLEN, "*", STREAM_FIELD, payloadJson);
  } catch (err) {
    console.warn("[run-stream] XADD failed; skipping PUBLISH", { runId });
    return;
  }
  try {
    await redis.publish(`run:${runId}`, payloadJson);
  } catch (err) {
    console.error("[run-stream] PUBLISH failed", { runId });
  }
}

export async function readRunEventHistory(
  redis: Redis,
  runId: string,
  limit = 2000,
): Promise<string[]> {
  const { payloads } = await readRunEventHistoryDetailed(redis, runId, limit);
  return payloads;
}

export async function readRunEventHistoryDetailed(
  redis: Redis,
  runId: string,
  limit = 2000,
): Promise<{ payloads: string[]; lastStreamId: string | null }> {
  const key = runEventStreamKey(runId);
  try {
    const entries = (await redis.xrange(key, "-", "+", "COUNT", String(limit))) as
      | [string, string[]][]
      | null;
    const parsed = parseStreamEntries(entries);
    const lastStreamId = parsed.length > 0 ? parsed[parsed.length - 1]!.id : null;
    return { payloads: parsed.map((p) => p.payload), lastStreamId };
  } catch (err) {
    throw new RedisStreamError(`Failed to read run event history for ${runId}`, {
      cause: err,
      details: { runId },
    });
  }
}

export async function readRunEventPayloadsAfterId(
  redis: Redis,
  runId: string,
  afterStreamId: string,
  limit = 2000,
): Promise<string[]> {
  const key = runEventStreamKey(runId);
  try {
    const start = `(${afterStreamId}`;
    const entries = (await redis.xrange(key, start, "+", "COUNT", String(limit))) as
      | [string, string[]][]
      | null;
    return parseStreamEntries(entries).map((p) => p.payload);
  } catch (err) {
    throw new RedisStreamError(`Failed to read run events after id for ${runId}`, {
      cause: err,
      details: { runId, afterStreamId },
    });
  }
}

export function askUserReplyQueueKey(runId: string, toolCallId: string): string {
  return `run:${runId}:ask:${toolCallId}`;
}
