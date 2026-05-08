import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const settingsRoutes = new Hono<GatewayEnv>();

settingsRoutes.get("/api-keys", async (c) => {
  const auth = c.get("auth");
  const result = await getPlatform().settings.listApiKeys(auth);
  return c.json(result);
});

const CreateOrUpdateKeySchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  scope: z.enum(["platform", "user"]).default("user"),
  apiKey: z.string().min(1),
  label: z.string().optional(),
});

settingsRoutes.post("/api-keys", async (c) => {
  const auth = c.get("auth");
  const body = CreateOrUpdateKeySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().settings.createOrUpdateApiKey(auth, body.data);
  return c.json(result, 201);
});

const UpdateKeySchema = z.object({
  label: z.string().optional(),
  apiKey: z.string().optional(),
});

settingsRoutes.patch("/api-keys/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const body = UpdateKeySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  await getPlatform().settings.updateApiKey(auth, id, body.data);
  return c.json({ ok: true });
});

settingsRoutes.delete("/api-keys/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  await getPlatform().settings.deleteApiKey(auth, id);
  return c.json({ ok: true });
});
