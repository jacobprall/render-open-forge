import { Hono } from "hono";
import type { GatewayEnv } from "../middleware/auth";
import { getForgeProviderForAuth } from "@openforge/platform/forge";

export const searchRoutes = new Hono<GatewayEnv>();

searchRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const q = c.req.query("q");
  if (!q) return c.json([]);

  const forge = getForgeProviderForAuth(auth);
  const repos = await forge.repos.search(q, 20);
  return c.json(repos);
});
