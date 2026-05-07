import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@render-open-forge/shared";
import { getDb } from "@/lib/db";
import { handleCIResult } from "@/lib/ci/result-handler";
import { ciResultPayloadSchema } from "@/lib/ci/ci-result-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Callback endpoint for Render Workflows CI runner tasks.
 * The ci-runner task POSTs results here after completing a CI job.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CI_RUNNER_SECRET;
  if (secret) {
    const provided = request.headers.get("x-ci-secret") ?? "";
    if (!timingSafeEqualUtf8(provided, secret)) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ciResultPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    await handleCIResult(db, parsed.data);
  } catch (err) {
    logger.errorWithCause(err, "ci results callback failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
