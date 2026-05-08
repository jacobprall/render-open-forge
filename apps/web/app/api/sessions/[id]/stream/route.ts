import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chats } from "@render-open-forge/db";
import { eq, and, desc } from "drizzle-orm";
import {
  readRunEventHistoryDetailed,
  readRunEventPayloadsAfterId,
} from "@render-open-forge/platform";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import { subscribeToRun } from "@/lib/sse/shared-subscriber";
import {
  canAcceptConnection,
  registerConnection,
  unregisterConnection,
  touchConnection,
} from "@/lib/sse/connection-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 25_000;

function isTerminalEvent(type: string): boolean {
  return type === "done" || type === "error" || type === "aborted";
}

function sseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, userSession] = await Promise.all([params, getSession()]);
  if (!userSession) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const uid = String(userSession.userId);
  const [sessionRow, chatRow] = await Promise.all([
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, uid)))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ activeRunId: chats.activeRunId })
      .from(chats)
      .where(eq(chats.sessionId, id))
      .orderBy(desc(chats.createdAt))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!sessionRow) {
    return new Response("Not found", { status: 404 });
  }

  const runId = chatRow?.activeRunId;

  if (!runId) {
    return new Response(sseData({ type: "no_active_run" }), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (!canAcceptConnection()) {
    return new Response(
      sseData({ type: "error", code: "TOO_MANY_CONNECTIONS", message: "Server at SSE capacity", retryable: true }),
      {
        status: 503,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Retry-After": "10",
        },
      },
    );
  }

  if (!isRedisConfigured()) {
    return new Response(
      sseData({ type: "error", code: "REDIS_NOT_CONFIGURED", message: "Redis not configured", retryable: false }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

  const cmd = createRedisClient(`sse-cmd-${id}`);

  let history: string[];
  let lastStreamId: string | null;
  try {
    const detailed = await readRunEventHistoryDetailed(cmd, runId);
    history = detailed.payloads;
    lastStreamId = detailed.lastStreamId;
  } catch {
    cmd.disconnect();
    return new Response(
      sseData({ type: "error", code: "REPLAY_FAILED", message: "Could not read event history", retryable: true }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

  let gap: string[] = [];
  if (lastStreamId) {
    try {
      gap = await readRunEventPayloadsAfterId(cmd, runId, lastStreamId);
    } catch {
      cmd.disconnect();
      return new Response(
        sseData({ type: "error", code: "REPLAY_FAILED", message: "Could not read event gap", retryable: true }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        },
      );
    }
  }

  const allPayloads = [...history, ...gap];
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
      gap.push(JSON.stringify({ type: syntheticType, message: "Run already finished", synthetic: true }));
    }
  }

  let keepAlive: ReturnType<typeof setInterval> | undefined;
  const connId = registerConnection(String(userSession.userId), id, runId);
  let activeSub: Awaited<ReturnType<typeof subscribeToRun>> | null = null;

  const cleanupAll = async () => {
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = undefined;
    unregisterConnection(connId);
    await activeSub?.unsubscribe().catch(() => {});
    activeSub = null;
    cmd.disconnect();
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string): boolean => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
          touchConnection(connId);
          const parsed = JSON.parse(payload) as { type?: string };
          if (parsed.type && isTerminalEvent(parsed.type)) {
            void cleanupAll();
            controller.close();
            return true;
          }
        } catch {
          // non-fatal parse error
        }
        return false;
      };

      for (const msg of history) {
        if (send(msg)) return;
      }
      for (const msg of gap) {
        if (send(msg)) return;
      }

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: ping\n\n`));
          touchConnection(connId);
        } catch {
          // stream closed
        }
      }, KEEPALIVE_MS);

      subscribeToRun(runId, (message: string) => {
        send(message);
      })
        .then((sub) => {
          activeSub = sub;
        })
        .catch((err: Error) => {
          console.error(`[sse] Shared subscription error:`, err);
          void cleanupAll();
          try {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "error", code: "STREAM_INTERRUPTED", message: "Connection interrupted", retryable: true })}\n\n`,
              ),
            );
          } catch {
            // ignore
          }
          controller.close();
        });
    },
    cancel() {
      void cleanupAll();
    },
  });

  req.signal.addEventListener("abort", () => {
    void cleanupAll();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
