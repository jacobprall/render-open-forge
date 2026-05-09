import { NextResponse } from "next/server";
import { logger } from "@openforge/shared";
import { getPlatform } from "@/lib/platform";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Render deploy webhook handler.
 * Receives deploy status notifications and auto-creates diagnostic sessions
 * when a deploy fails.
 *
 * Render webhook payloads (deploy events) look like:
 * {
 *   "type": "deploy",
 *   "data": {
 *     "id": "dep-xxx",
 *     "serviceId": "srv-xxx",
 *     "serviceName": "my-service",
 *     "status": "build_failed" | "update_failed" | "live" | ...,
 *     "commit": { "id": "abc123", "message": "fix stuff" }
 *   }
 * }
 */

interface RenderWebhookPayload {
  type?: string;
  data?: {
    id?: string;
    serviceId?: string;
    serviceName?: string;
    status?: string;
    commit?: {
      id?: string;
      message?: string;
    };
  };
}

const FAILURE_STATUSES = new Set([
  "build_failed",
  "update_failed",
  "deactivated",
  "pre_deploy_failed",
]);

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const secret = process.env.RENDER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RENDER_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("render-signature") ?? req.headers.get("x-render-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: RenderWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as RenderWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = payload.data;
  if (!data?.serviceId || !data?.status) {
    return NextResponse.json({ received: true, action: "ignored" });
  }

  if (!FAILURE_STATUSES.has(data.status)) {
    return NextResponse.json({ received: true, action: "ignored", status: data.status });
  }

  logger.info("render webhook: deploy failure detected", {
    serviceId: data.serviceId,
    deployId: data.id,
    status: data.status,
  });

  const { sessions } = getPlatform();

  try {
    const result = await sessions.createFromDeployFailure({
      serviceId: data.serviceId,
      serviceName: data.serviceName ?? data.serviceId,
      deployId: data.id ?? "unknown",
      commitId: data.commit?.id,
      commitMessage: data.commit?.message,
    });

    if (!result) {
      return NextResponse.json({ received: true, action: "no_matching_resource" });
    }

    return NextResponse.json({
      received: true,
      action: "session_created",
      sessionId: result.sessionId,
      runId: result.runId,
    });
  } catch (err) {
    logger.errorWithCause(err, "render webhook: failed to create diagnostic session", {
      serviceId: data.serviceId,
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
