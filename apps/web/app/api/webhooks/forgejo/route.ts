import { NextRequest, NextResponse } from "next/server";
import {
  verifyForgejoWebhookSignature,
  isForgejoWebhookVerificationConfigured,
  shouldAllowUnsignedForgejoWebhooks,
  logger,
} from "@render-open-forge/shared";
import { getDb } from "@/lib/db";
import { processForgejoWebhook } from "@/lib/webhooks/forgejo-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forgejo → platform webhooks (CI, PRs, push, comments, commit status).
 * Configure in Forgejo with the same secret as FORGEJO_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.FORGEJO_WEBHOOK_SECRET ?? "";

  if (isForgejoWebhookVerificationConfigured()) {
    const sig =
      verifyForgejoWebhookSignature(
        rawBody,
        request.headers.get("x-forgejo-signature"),
        request.headers.get("x-gitea-signature"),
        secret,
      );
    if (!sig) {
      logger.warn("forgejo webhook rejected: invalid signature", {});
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (!shouldAllowUnsignedForgejoWebhooks()) {
    logger.warn("forgejo webhook rejected: FORGEJO_WEBHOOK_SECRET not set", {});
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const event = request.headers.get("x-forgejo-event") ?? request.headers.get("x-gitea-event");

  try {
    const db = getDb();
    await processForgejoWebhook(db, event, rawBody);
  } catch (err) {
    logger.errorWithCause(err, "forgejo webhook handler failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
