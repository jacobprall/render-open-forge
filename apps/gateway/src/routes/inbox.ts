import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";
import { formatZodError } from "../middleware/validation";

export const inboxRoutes = new Hono<GatewayEnv>();

inboxRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const filter = (c.req.query("filter") as "unread" | "action_needed" | "all") || undefined;
  const limit = Number(c.req.query("limit") ?? 20);
  const offset = Number(c.req.query("offset") ?? 0);
  const result = await getPlatform().inbox.list(auth, { filter, limit, offset });
  return c.json(result);
});

inboxRoutes.get("/count", async (c) => {
  const auth = c.get("auth");
  const count = await getPlatform().inbox.countUnread(auth);
  return c.json({ unread: count });
});

const DismissSchema = z.object({ eventIds: z.array(z.string()).min(1) });

inboxRoutes.post("/dismiss", async (c) => {
  const auth = c.get("auth");
  const body = DismissSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: formatZodError(body.error) }, 400);
  await getPlatform().inbox.dismiss(auth, body.data.eventIds);
  return c.json({ ok: true });
});

const MarkReadSchema = z.object({
  ids: z.array(z.string()).optional(),
  markAll: z.boolean().optional(),
});

inboxRoutes.post("/read", async (c) => {
  const auth = c.get("auth");
  const body = MarkReadSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: formatZodError(body.error) }, 400);
  await getPlatform().inbox.markRead(auth, body.data);
  return c.json({ ok: true });
});
