import { NextResponse } from "next/server";
import { logger } from "@openforge/shared";
import { getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

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
    return handlePlatformError(err);
  }

  try {
    await webhooks.handleGitlabEvent(event, rawBody);
  } catch (err) {
    logger.errorWithCause(err, "gitlab webhook handler failed", {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
