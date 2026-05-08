import { NextResponse } from "next/server";
import { logger } from "@openforge/shared";
import { getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const event = req.headers.get("x-github-event");

  const { webhooks } = getPlatform();

  try {
    await webhooks.handleGithubWebhook(rawBody, signature);
  } catch (err) {
    if (isPlatformError(err)) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  try {
    await webhooks.handleGithubEvent(event, rawBody);
  } catch (err) {
    logger.errorWithCause(err, "github webhook handler failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
