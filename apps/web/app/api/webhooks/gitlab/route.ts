import { NextResponse } from "next/server";
import { logger } from "@render-open-forge/shared";
import { getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const gitlabToken = req.headers.get("x-gitlab-token") ?? "";
  const event = req.headers.get("x-gitlab-event");

  const { webhooks } = getPlatform();

  try {
    await webhooks.handleGitlabWebhook(rawBody, gitlabToken);
  } catch (err) {
    if (isPlatformError(err)) {
      logger.warn("gitlab webhook: signature verification failed", {});
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  try {
    await webhooks.handleGitlabEvent(event, rawBody);
  } catch (err) {
    logger.errorWithCause(err, "gitlab webhook handler failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
