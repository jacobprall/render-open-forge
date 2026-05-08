import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const inviteRoutes = new Hono<GatewayEnv>();

inviteRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const result = await getPlatform().invites.listInvites(auth);
  return c.json(result);
});

const CreateInviteSchema = z.object({
  username: z.string().min(1),
  email: z.string().email().optional(),
});

inviteRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = CreateInviteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().invites.createInvite(auth, body.data);
  return c.json(result, 201);
});

const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

inviteRoutes.post("/accept", async (c) => {
  const body = AcceptInviteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().invites.acceptInvite(body.data.token, body.data.password);
  return c.json(result);
});
