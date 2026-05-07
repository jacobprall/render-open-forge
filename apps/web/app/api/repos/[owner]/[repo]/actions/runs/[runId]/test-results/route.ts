import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { ciEvents } from "@render-open-forge/db"
import { eq } from "drizzle-orm"
import { parseJUnitXML, parseTAPOutput } from "@render-open-forge/shared"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { runId } = await params
  const db = getDb()

  const event = await db
    .select()
    .from(ciEvents)
    .where(eq(ciEvents.runId, runId))
    .then((r) => r[0] ?? null)

  if (!event) {
    const eventById = await db
      .select()
      .from(ciEvents)
      .where(eq(ciEvents.id, runId))
      .then((r) => r[0] ?? null)

    if (!eventById) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    return respondWithResults(eventById.payload as Record<string, unknown> | null)
  }

  return respondWithResults(event.payload as Record<string, unknown> | null)
}

function respondWithResults(payload: Record<string, unknown> | null) {
  if (!payload) {
    return NextResponse.json({ testResults: null, message: "No payload available" })
  }

  // Try to extract test results from the CI event payload
  // The payload may contain JUnit XML or TAP output in various known fields
  const possibleXmlFields = ["junit_xml", "test_xml", "testResults", "test_results"]
  const possibleTapFields = ["tap_output", "tap", "test_output"]

  for (const field of possibleXmlFields) {
    const val = payload[field]
    if (typeof val === "string" && val.includes("<testsuite")) {
      try {
        return NextResponse.json({ testResults: parseJUnitXML(val) })
      } catch {
        // continue trying other fields
      }
    }
  }

  for (const field of possibleTapFields) {
    const val = payload[field]
    if (typeof val === "string" && (/^(not )?ok\s/m.test(val) || /^TAP version/m.test(val))) {
      try {
        return NextResponse.json({ testResults: parseTAPOutput(val) })
      } catch {
        // continue trying other fields
      }
    }
  }

  // Check nested workflow_run for test results
  const wr = payload.workflow_run as Record<string, unknown> | undefined
  if (wr) {
    for (const field of possibleXmlFields) {
      const val = wr[field]
      if (typeof val === "string" && val.includes("<testsuite")) {
        try {
          return NextResponse.json({ testResults: parseJUnitXML(val) })
        } catch {
          // continue
        }
      }
    }
  }

  return NextResponse.json({ testResults: null, message: "No test results found in payload" })
}
