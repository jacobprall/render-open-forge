import { NextRequest, NextResponse } from "next/server";
import { ciResultPayloadSchema } from "@openforge/platform/services";
import { getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await parseJsonBody(request);

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
    return handlePlatformError(err);
  }

  return NextResponse.json({ received: true });
}
