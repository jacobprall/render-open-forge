import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const sessionRoutes = new Hono<GatewayEnv>();

const CreateSessionSchema = z.object({
  repoPath: z.string(),
  branch: z.string(),
  title: z.string().optional(),
  activeSkills: z
    .array(z.object({ source: z.enum(["builtin", "user", "repo"]), slug: z.string() }))
    .optional(),
});

sessionRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = CreateSessionSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().sessions.create(auth, body.data);
  return c.json(result, 201);
});

const SendMessageSchema = z.object({
  content: z.string(),
  modelId: z.string().optional(),
  requestId: z.string().optional(),
});

sessionRoutes.post("/:id/message", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const body = SendMessageSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().sessions.sendMessage(auth, sessionId, body.data);
  return c.json(result);
});

const ReplySchema = z.object({
  toolCallId: z.string(),
  message: z.string(),
  runId: z.string().optional(),
});

sessionRoutes.post("/:id/reply", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const body = ReplySchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  await getPlatform().sessions.reply(auth, sessionId, body.data);
  return c.json({ ok: true });
});

sessionRoutes.post("/:id/stop", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const result = await getPlatform().sessions.stop(auth, sessionId);
  return c.json(result);
});

const UpdatePhaseSchema = z.object({ phase: z.string() });

sessionRoutes.post("/:id/phase", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const body = UpdatePhaseSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  await getPlatform().sessions.updatePhase(auth, sessionId, body.data.phase);
  return c.json({ ok: true });
});

sessionRoutes.patch("/:id/config", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const body = await c.req.json();
  const result = await getPlatform().sessions.updateConfig(auth, sessionId, body);
  return c.json(result);
});

sessionRoutes.get("/:id/skills", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const skills = await getPlatform().sessions.getSkills(auth, sessionId);
  return c.json(skills);
});

const UpdateSkillsSchema = z.object({
  skills: z.array(
    z.object({ source: z.enum(["builtin", "user", "repo"]), slug: z.string() }),
  ),
});

sessionRoutes.patch("/:id/skills", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const body = UpdateSkillsSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  await getPlatform().sessions.updateSkills(auth, sessionId, body.data.skills);
  return c.json({ ok: true });
});

const SpecActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  specId: z.string(),
  rejectionNote: z.string().optional(),
});

sessionRoutes.post("/:id/spec", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const body = SpecActionSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().sessions.handleSpecAction(auth, sessionId, body.data);
  return c.json(result);
});

sessionRoutes.post("/:id/auto-title", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const result = await getPlatform().sessions.generateAutoTitle(sessionId, auth.userId);
  return c.json(result);
});

sessionRoutes.get("/:id/ci-events", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const events = await getPlatform().sessions.listCiEvents(auth, sessionId);
  return c.json(events);
});

const ReviewJobSchema = z
  .object({ fixContext: z.string().optional() })
  .optional();

sessionRoutes.post("/:id/review", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  const raw = await c.req.json().catch(() => undefined);
  const body = ReviewJobSchema.safeParse(raw);
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await getPlatform().sessions.enqueueReviewJob(auth, sessionId, body.data);
  return c.json(result ?? { ok: true });
});

sessionRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const sessionId = c.req.param("id");
  await getPlatform().sessions.archive(auth, sessionId);
  return c.json({ ok: true });
});
