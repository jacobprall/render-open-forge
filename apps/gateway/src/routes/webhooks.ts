import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ValidationError, logger } from "@openforge/shared";
import { getPlatform } from "../platform";

export const webhookRoutes = new Hono();

webhookRoutes.post("/forgejo", async (c) => {
  const rawBody = await c.req.text();
  const signature =
    c.req.header("x-forgejo-signature") ??
    c.req.header("x-gitea-signature") ??
    null;
  const event =
    c.req.header("x-forgejo-event") ??
    c.req.header("x-gitea-event") ??
    null;

  const webhooks = getPlatform().webhooks;

  try {
    await webhooks.handleForgejoWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 401);
    throw err;
  }

  try {
    await webhooks.handleForgejoEvent(event, rawBody);
  } catch (err) {
    return c.json({ error: "Event processing failed" }, 500);
  }

  return c.json({ ok: true });
});

webhookRoutes.post("/github", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256") ?? null;
  const event = c.req.header("x-github-event") ?? null;

  const webhooks = getPlatform().webhooks;

  try {
    await webhooks.handleGithubWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 401);
    throw err;
  }

  try {
    await webhooks.handleGithubEvent(event, rawBody);
  } catch (err) {
    return c.json({ error: "Event processing failed" }, 500);
  }

  return c.json({ ok: true });
});

webhookRoutes.post("/gitlab", async (c) => {
  const rawBody = await c.req.text();
  const token = c.req.header("x-gitlab-token") ?? null;
  const event = c.req.header("x-gitlab-event") ?? null;

  const webhooks = getPlatform().webhooks;

  try {
    await webhooks.handleGitlabWebhook(rawBody, token);
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 401);
    throw err;
  }

  try {
    await webhooks.handleGitlabEvent(event, rawBody);
  } catch (err) {
    return c.json({ error: "Event processing failed" }, 500);
  }

  return c.json({ ok: true });
});

const FAILURE_STATUSES = new Set(["build_failed", "update_failed", "deactivated", "pre_deploy_failed"]);

function verifyRenderSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

webhookRoutes.post("/render", async (c) => {
  const secret = process.env.RENDER_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "RENDER_WEBHOOK_SECRET not configured" }, 500);

  const rawBody = await c.req.text();
  const signature = c.req.header("render-signature") ?? c.req.header("x-render-signature") ?? null;

  if (!verifyRenderSignature(rawBody, signature, secret)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let payload: { type?: string; data?: { id?: string; serviceId?: string; serviceName?: string; status?: string; commit?: { id?: string; message?: string } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const data = payload.data;
  if (!data?.serviceId || !data?.status) return c.json({ received: true, action: "ignored" });
  if (!FAILURE_STATUSES.has(data.status)) return c.json({ received: true, action: "ignored", status: data.status });

  logger.info("render webhook: deploy failure detected", { serviceId: data.serviceId, deployId: data.id, status: data.status });

  try {
    const result = await getPlatform().sessions.createFromDeployFailure({
      serviceId: data.serviceId,
      serviceName: data.serviceName ?? data.serviceId,
      deployId: data.id ?? "unknown",
      commitId: data.commit?.id,
      commitMessage: data.commit?.message,
    });
    if (!result) return c.json({ received: true, action: "no_matching_resource" });
    return c.json({ received: true, action: "session_created", sessionId: result.sessionId, runId: result.runId });
  } catch (err) {
    logger.errorWithCause(err, "render webhook: failed to create diagnostic session", { serviceId: data.serviceId });
    return c.json({ error: "Processing failed" }, 500);
  }
});
