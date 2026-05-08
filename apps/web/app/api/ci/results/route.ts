import { NextRequest, NextResponse } from "next/server";
import { logger } from "@openforge/shared";
import { ciResultPayloadSchema } from "@openforge/platform/services";
import { getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

  const secret = request.headers.get("x-ci-secret") ?? "";

  try {
    await getPlatform().ci.handleResult(secret, parsed.data);
  } catch (err) {
    if (isPlatformError(err)) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    logger.errorWithCause(err, "ci results callback failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
