import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const orgSingularRoutes = new Hono<GatewayEnv>();

const UpdateOrgSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
});

orgSingularRoutes.get("/", async (c) => {
  const org = await getPlatform().orgs.getPlatformOrg();
  if (!org) return c.json({ error: "Organization not configured" }, 404);
  return c.json(org);
});

orgSingularRoutes.patch("/", async (c) => {
  const auth = c.get("auth");
  const body = UpdateOrgSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const org = await getPlatform().orgs.updatePlatformOrg(auth, body.data);
  return c.json(org);
});

orgSingularRoutes.get("/members", async (c) => {
  const members = await getPlatform().orgs.listPlatformMembers();
  return c.json(members);
});
