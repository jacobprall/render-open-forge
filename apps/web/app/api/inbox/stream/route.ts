import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { prEvents } from "@openforge/db";
import { eq, and, sql } from "drizzle-orm";

const HEARTBEAT_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 5_000;

export async function GET(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = String(userSession.userId);

  const encoder = new TextEncoder();
  let closed = false;
  let lastCount = -1;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          closed = true;
        }
      }

      async function checkCount() {
        if (closed) return;
        try {
          const db = getDb();
          const [result] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(prEvents)
            .where(
              and(
                eq(prEvents.userId, userId),
                eq(prEvents.actionNeeded, true),
                eq(prEvents.read, false),
              ),
            );
          const count = result?.count ?? 0;
          if (count !== lastCount) {
            lastCount = count;
            send("count", JSON.stringify({ count }));
          }
        } catch {
          // DB error — skip this cycle
        }
      }

      await checkCount();

      const pollTimer = setInterval(checkCount, POLL_INTERVAL_MS);
      const heartbeatTimer = setInterval(() => {
        send("heartbeat", "{}");
      }, HEARTBEAT_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
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
