import { NextRequest, NextResponse } from "next/server";
import { logger } from "@render-open-forge/shared";
import { getDb } from "@/lib/db";
import { processForgejoWebhook } from "@/lib/webhooks/forgejo-dispatch";
import { getAgentForgeProvider } from "@/lib/forgejo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Forgejo → platform webhooks (CI, PRs, push, comments, commit status).
 * Configure in Forgejo with the same secret as FORGEJO_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const forge = getAgentForgeProvider();

  const sig = request.headers.get("x-forgejo-signature")
    ?? request.headers.get("x-gitea-signature")
    ?? "";

  if (!forge.webhooks.verifySignature(rawBody, sig)) {
    logger.warn("forgejo webhook rejected: invalid signature", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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
