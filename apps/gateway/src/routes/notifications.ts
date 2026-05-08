import { Hono } from "hono";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const notificationRoutes = new Hono<GatewayEnv>();

notificationRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const limit = Number(c.req.query("limit") ?? 20);
  const offset = Number(c.req.query("offset") ?? 0);
  const result = await getPlatform().notifications.list(auth, { limit, offset });
  return c.json(result);
});
