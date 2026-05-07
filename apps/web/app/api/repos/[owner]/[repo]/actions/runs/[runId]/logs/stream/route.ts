import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { createForgejoClient } from "@/lib/forgejo/client"

const POLL_INTERVAL_MS = 3000

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { owner, repo } = await params
  const jobId = req.nextUrl.searchParams.get("jobId")
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId query parameter" }, { status: 400 })
  }

  const client = createForgejoClient(session.forgejoToken)
  const resolvedJobId = jobId

  let sentLength = 0
  let consecutiveErrors = 0
  const MAX_ERRORS = 5

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function send(eventName: string, data: string) {
        controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${data}\n\n`))
      }

      async function poll() {
        try {
          const logs = await client.getActionJobLogs(owner, repo, resolvedJobId)
          consecutiveErrors = 0

          if (logs.length > sentLength) {
            const chunk = logs.slice(sentLength)
            send("log", JSON.stringify({ offset: sentLength, chunk }))
            sentLength = logs.length
          }
        } catch (e) {
          consecutiveErrors++
          const message = e instanceof Error ? e.message : "Failed to fetch logs"
          send("error", JSON.stringify({ message }))
          if (consecutiveErrors >= MAX_ERRORS) {
            send("done", JSON.stringify({ reason: "too_many_errors" }))
            controller.close()
            return
          }
        }
      }

      await poll()

      const timer = setInterval(async () => {
        if (req.signal.aborted) {
          clearInterval(timer)
          controller.close()
          return
        }
        await poll()
      }, POLL_INTERVAL_MS)

      req.signal.addEventListener("abort", () => {
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
