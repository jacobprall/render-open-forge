import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const orgRoutes = new Hono<GatewayEnv>();

// ---------------------------------------------------------------------------
// GET / — list orgs
// ---------------------------------------------------------------------------

orgRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const orgs = await getPlatform().orgs.listOrgs(auth);
  return c.json(orgs);
});

// ---------------------------------------------------------------------------
// POST / — create org
// ---------------------------------------------------------------------------

const CreateOrgSchema = z.object({
  login: z.string(),
  fullName: z.string().optional(),
  description: z.string().optional(),
});

orgRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = CreateOrgSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const org = await getPlatform().orgs.createOrg(auth, body.data);
  return c.json(org, 201);
});

// ---------------------------------------------------------------------------
// DELETE /:org
// ---------------------------------------------------------------------------

orgRoutes.delete("/:org", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  await getPlatform().orgs.deleteOrg(auth, org);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /:org/members
// ---------------------------------------------------------------------------

orgRoutes.get("/:org/members", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  const members = await getPlatform().orgs.listMembers(auth, org);
  return c.json(members);
});

// ---------------------------------------------------------------------------
// PUT /:org/members/:username
// ---------------------------------------------------------------------------

orgRoutes.put("/:org/members/:username", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  const username = c.req.param("username");
  await getPlatform().orgs.addMember(auth, org, username);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /:org/members/:username
// ---------------------------------------------------------------------------

orgRoutes.delete("/:org/members/:username", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  const username = c.req.param("username");
  await getPlatform().orgs.removeMember(auth, org, username);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /:org/secrets
// ---------------------------------------------------------------------------

orgRoutes.get("/:org/secrets", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  const secrets = await getPlatform().orgs.listSecrets(auth, org);
  return c.json(secrets);
});

// ---------------------------------------------------------------------------
// POST /:org/secrets
// ---------------------------------------------------------------------------

const SetOrgSecretSchema = z.object({
  name: z.string(),
  value: z.string(),
});

orgRoutes.post("/:org/secrets", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  const body = SetOrgSecretSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  await getPlatform().orgs.setSecret(auth, org, body.data.name, body.data.value);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /:org/secrets/:name
// ---------------------------------------------------------------------------

orgRoutes.delete("/:org/secrets/:name", async (c) => {
  const auth = c.get("auth");
  const org = c.req.param("org");
  const name = c.req.param("name");
  await getPlatform().orgs.deleteSecret(auth, org, name);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /:org/usage
// ---------------------------------------------------------------------------

orgRoutes.get("/:org/usage", async (c) => {
  const auth = c.get("auth");
  const usage = await getPlatform().orgs.getUsage(auth);
  return c.json(usage);
});
