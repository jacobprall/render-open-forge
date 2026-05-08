import { Hono } from "hono";
import { ValidationError } from "@openforge/shared";
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
