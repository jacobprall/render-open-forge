import { Hono } from "hono";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const modelRoutes = new Hono<GatewayEnv>();

modelRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const result = await getPlatform().models.listModels(auth);
  return c.json(result);
});
