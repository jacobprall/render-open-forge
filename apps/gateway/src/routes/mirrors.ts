import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";
import { formatZodError } from "../middleware/validation";

export const mirrorRoutes = new Hono<GatewayEnv>();

// ---------------------------------------------------------------------------
// GET / — list mirrors
// ---------------------------------------------------------------------------

mirrorRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const limit = Number(c.req.query("limit") ?? 20);
  const offset = Number(c.req.query("offset") ?? 0);
  const result = await getPlatform().mirrors.list(auth, { limit, offset });
  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST / — create mirror
// ---------------------------------------------------------------------------

const CreateMirrorSchema = z.object({
  syncConnectionId: z.string(),
  localRepoPath: z.string(),
  remoteRepoUrl: z.string(),
  direction: z.enum(["pull", "push", "bidirectional"]),
  remoteToken: z.string().optional(),
  sessionId: z.string().optional(),
});

mirrorRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = CreateMirrorSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: formatZodError(body.error) }, 400);

  const mirror = await getPlatform().mirrors.create(auth, body.data);
  return c.json(mirror, 201);
});

// ---------------------------------------------------------------------------
// POST /:id/sync
// ---------------------------------------------------------------------------

mirrorRoutes.post("/:id/sync", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  await getPlatform().mirrors.sync(auth, id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------

mirrorRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  await getPlatform().mirrors.delete(auth, id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /:id/resolve
// ---------------------------------------------------------------------------

const ResolveConflictSchema = z
  .object({ strategy: z.enum(["force-push", "manual", "rebase"]).optional() })
  .optional();

mirrorRoutes.post("/:id/resolve", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const body = ResolveConflictSchema.safeParse(raw);
  if (!body.success) return c.json({ error: formatZodError(body.error) }, 400);

  const result = await getPlatform().mirrors.resolveConflict(auth, id, body.data?.strategy);
  return c.json(result);
});
