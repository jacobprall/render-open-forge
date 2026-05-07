/**
 * Shared Redis pub/sub subscriber for SSE streams.
 *
 * Instead of creating 2 Redis connections per SSE client (up to 1000 at
 * 500 limit), this module maintains a single shared pub/sub connection
 * and fans out messages to per-channel listener sets.
 */

import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import type Redis from "ioredis";

type MessageHandler = (message: string) => void;

let sharedSub: Redis | null = null;
const channelListeners = new Map<string, Set<MessageHandler>>();

function ensureSharedSub(): Redis {
  if (sharedSub) return sharedSub;
  if (!isRedisConfigured()) throw new Error("Redis not configured");
  sharedSub = createRedisClient("sse-shared-sub");
  sharedSub.on("message", (channel: string, message: string) => {
    const handlers = channelListeners.get(channel);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
        // Non-fatal: individual handler failure shouldn't crash others
      }
    }
  });
  sharedSub.on("error", (err: Error) => {
    console.error("[shared-sub] Redis error:", err);
  });
  return sharedSub;
}

export async function subscribeToRun(
  runId: string,
  handler: MessageHandler,
): Promise<{ unsubscribe: () => Promise<void> }> {
  const sub = ensureSharedSub();
  const channel = `run:${runId}`;
  let handlers = channelListeners.get(channel);
  if (!handlers) {
    handlers = new Set();
    channelListeners.set(channel, handlers);
    await sub.subscribe(channel);
  }
  handlers.add(handler);

  return {
    unsubscribe: async () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) {
        channelListeners.delete(channel);
        await sub.unsubscribe(channel).catch(() => {});
      }
    },
  };
}
