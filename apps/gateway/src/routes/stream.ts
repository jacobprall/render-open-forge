/**
 * SSE streaming endpoints for the gateway.
 *
 * - GET /sessions/:id  — real-time agent run events
 * - GET /inbox         — inbox count polling
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import Redis from "ioredis";
import { eq, and, desc, sql } from "drizzle-orm";
import { sessions, chats, prEvents } from "@openforge/db";
import {
  readRunEventHistoryDetailed,
  readRunEventPayloadsAfterId,
} from "@openforge/platform";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const streamRoutes = new Hono<GatewayEnv>();

const KEEPALIVE_MS = 25_000;
const INBOX_POLL_MS = 5_000;
const INBOX_HEARTBEAT_MS = 15_000;

function isTerminalEvent(type: string): boolean {
  return type === "done" || type === "error" || type === "aborted";
}

function getRedisUrl(): string {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) throw new Error("REDIS_URL is required");
  return raw.includes("://") ? raw : `redis://${raw}`;
}

// ---------------------------------------------------------------------------
// Shared pub/sub subscriber (single Redis connection fans out to listeners)
// ---------------------------------------------------------------------------

type MessageHandler = (message: string) => void;
let sharedSub: Redis | null = null;
const channelListeners = new Map<string, Set<MessageHandler>>();

function ensureSharedSub(): Redis {
  if (sharedSub) return sharedSub;
  sharedSub = new Redis(getRedisUrl(), {
    connectionName: "gateway-sse-sub",
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
  sharedSub.on("message", (channel: string, message: string) => {
    const handlers = channelListeners.get(channel);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(message); } catch { /* non-fatal */ }
    }
  });
  sharedSub.on("error", (err: Error) => {
    console.error("[gateway-sse] Redis sub error:", err.message);
  });
  return sharedSub;
}

async function subscribeToRun(
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

// ---------------------------------------------------------------------------
// GET /sessions/:id — agent run event stream
// ---------------------------------------------------------------------------

streamRoutes.get("/sessions/:id", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const db = getPlatform().db;

  const [sessionRow, chatRow] = await Promise.all([
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, auth.userId)))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ activeRunId: chats.activeRunId })
      .from(chats)
      .where(eq(chats.sessionId, sessionId))
      .orderBy(desc(chats.createdAt))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!sessionRow) return c.json({ error: "Session not found" }, 404);

  const runId = chatRow?.activeRunId;

  if (!runId) {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache, no-transform");
    return c.body(`data: ${JSON.stringify({ type: "no_active_run" })}\n\n`);
  }

  const cmd = new Redis(getRedisUrl(), {
    connectionName: `gateway-sse-cmd-${sessionId}`,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  let detailed: { payloads: string[]; lastStreamId: string | null };
  try {
    detailed = await readRunEventHistoryDetailed(cmd, runId);
  } catch {
    cmd.disconnect();
    c.header("Content-Type", "text/event-stream");
    return c.body(
      `data: ${JSON.stringify({ type: "error", code: "REPLAY_FAILED", retryable: true })}\n\n`,
    );
  }

  let gap: string[] = [];
  if (detailed.lastStreamId) {
    try {
      gap = await readRunEventPayloadsAfterId(cmd, runId, detailed.lastStreamId);
    } catch {
      cmd.disconnect();
      c.header("Content-Type", "text/event-stream");
      return c.body(
        `data: ${JSON.stringify({ type: "error", code: "REPLAY_FAILED", retryable: true })}\n\n`,
      );
    }
  }

  const allPayloads = [...detailed.payloads, ...gap];
  const hasTerminal = allPayloads.some((p) => {
    try {
      const parsed = JSON.parse(p) as { type?: string };
      return parsed.type ? isTerminalEvent(parsed.type) : false;
    } catch {
      return false;
    }
  });

  if (!hasTerminal) {
    const runStatus = await cmd.get(`run:${runId}:status`).catch(() => null);
    if (runStatus === "completed" || runStatus === "failed" || runStatus === "aborted") {
      const syntheticType =
        runStatus === "completed" ? "done" : runStatus === "aborted" ? "aborted" : "error";
      allPayloads.push(
        JSON.stringify({ type: syntheticType, message: "Run already finished", synthetic: true }),
      );
    }
  }

  return streamSSE(c, async (stream) => {
    let closed = false;

    const cleanup = async () => {
      closed = true;
      await sub?.unsubscribe().catch(() => {});
      cmd.disconnect();
    };

    stream.onAbort(() => void cleanup());

    for (const payload of allPayloads) {
      if (closed) return;
      await stream.writeSSE({ data: payload });
      try {
        const parsed = JSON.parse(payload) as { type?: string };
        if (parsed.type && isTerminalEvent(parsed.type)) {
          await cleanup();
          return;
        }
      } catch { /* non-fatal */ }
    }

    const keepAlive = setInterval(async () => {
      if (closed) return;
      try {
        await stream.writeSSE({ event: "ping", data: "" });
      } catch {
        clearInterval(keepAlive);
        await cleanup();
      }
    }, KEEPALIVE_MS);

    let sub: Awaited<ReturnType<typeof subscribeToRun>> | null = null;
    try {
      sub = await subscribeToRun(runId, (message) => {
        if (closed) return;
        stream.writeSSE({ data: message }).catch(() => {});
        try {
          const parsed = JSON.parse(message) as { type?: string };
          if (parsed.type && isTerminalEvent(parsed.type)) {
            clearInterval(keepAlive);
            void cleanup();
          }
        } catch { /* non-fatal */ }
      });
    } catch {
      clearInterval(keepAlive);
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", code: "STREAM_INTERRUPTED", retryable: true }),
      });
      await cleanup();
      return;
    }

    // Hold stream open until abort or terminal event
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (closed) {
          clearInterval(check);
          clearInterval(keepAlive);
          resolve();
        }
      }, 1000);
      stream.onAbort(() => {
        clearInterval(check);
        clearInterval(keepAlive);
        resolve();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// GET /inbox — inbox count polling stream
// ---------------------------------------------------------------------------

streamRoutes.get("/inbox", async (c) => {
  const auth = c.get("auth");

  return streamSSE(c, async (stream) => {
    let closed = false;
    let lastCount = -1;

    stream.onAbort(() => { closed = true; });

    async function checkCount() {
      if (closed) return;
      try {
        const db = getPlatform().db;
        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(prEvents)
          .where(
            and(
              eq(prEvents.userId, auth.userId),
              eq(prEvents.actionNeeded, true),
              eq(prEvents.read, false),
            ),
          );
        const count = result?.count ?? 0;
        if (count !== lastCount) {
          lastCount = count;
          await stream.writeSSE({ event: "count", data: JSON.stringify({ count }) });
        }
      } catch { /* skip this cycle */ }
    }

    await checkCount();

    const pollTimer = setInterval(checkCount, INBOX_POLL_MS);
    const heartbeatTimer = setInterval(async () => {
      if (closed) return;
      try {
        await stream.writeSSE({ event: "heartbeat", data: "{}" });
      } catch {
        closed = true;
      }
    }, INBOX_HEARTBEAT_MS);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        resolve();
      });
    });
  });
});
