import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";
import { formatZodError } from "../middleware/validation";

export const skillRoutes = new Hono<GatewayEnv>();

skillRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const repoPath = c.req.query("repoPath");
  const result = await getPlatform().skills.listSkills(auth, repoPath);
  return c.json(result);
});

const InstallSchema = z.object({
  url: z.string().min(1),
  name: z.string().optional(),
});

skillRoutes.post("/install", async (c) => {
  const auth = c.get("auth");
  const body = InstallSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: formatZodError(body.error) }, 400);
  const result = await getPlatform().skills.installSkill(auth, body.data);
  return c.json(result, 201);
});

skillRoutes.post("/sync", async (c) => {
  const auth = c.get("auth");
  await getPlatform().skills.syncSkills(auth);
  return c.json({ ok: true });
});

skillRoutes.get("/repo/*", async (c) => {
  const auth = c.get("auth");
  const path = c.req.path.replace(/^\/repo\//, "");
  const segments = path.split("/").filter(Boolean);
  const owner = segments[0] ?? "";
  const repo = segments[1] ?? "";
  if (!owner || !repo) return c.json({ error: "Invalid repo path" }, 400);
  const result = await getPlatform().skills.listRepoSkills(auth, owner, repo);
  return c.json(result);
});
