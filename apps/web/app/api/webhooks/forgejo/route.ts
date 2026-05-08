import { NextRequest, NextResponse } from "next/server";
import { logger } from "@openforge/shared";
import { getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-forgejo-signature") ??
    request.headers.get("x-gitea-signature") ??
    "";

  const { webhooks } = getPlatform();

  try {
    await webhooks.handleForgejoWebhook(rawBody, signature);
  } catch (err) {
    if (isPlatformError(err)) {
      logger.warn("forgejo webhook rejected: invalid signature", {});
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const event =
    request.headers.get("x-forgejo-event") ??
    request.headers.get("x-gitea-event");

  try {
    await webhooks.handleForgejoEvent(event, rawBody);
  } catch (err) {
    logger.errorWithCause(err, "forgejo webhook handler failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
