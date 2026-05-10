import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";
import { getForgeProviderForAuth } from "@openforge/platform/forge";

export const sessionRoutes = new Hono<GatewayEnv>();

const CreateSessionSchema = z.object({
  repoPath: z.string().optional(),
  branch: z.string().optional(),
  baseBranch: z.string().optional(),
  title: z.string().optional(),
  forgeType: z.enum(["forgejo", "github", "gitlab"]).optional(),
  activeSkills: z
    .array(z.object({ source: z.enum(["builtin", "user", "repo"]), slug: z.string() }))
    .optional(),
  firstMessage: z.string().optional(),
  modelId: z.string().optional(),
  projectId: z.string().optional(),
});

sessionRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = CreateSessionSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const data = body.data;
  const platform = getPlatform();
  const branch = data.repoPath ? (data.branch || data.baseBranch || "main") : undefined;

  let projectId = data.projectId;
  if (projectId) {
    const project = await platform.projects.get(auth, projectId);
    if (!project) return c.json({ error: "Project not found" }, 404);
  } else if (data.repoPath) {
    const project = await platform.projects.findOrCreateForRepo(auth, data.repoPath, data.forgeType);
    projectId = project.id;
  } else {
    const scratch = await platform.projects.getScratchProject(auth);
    projectId = scratch.id;
  }

  const result = await platform.sessions.create(auth, { ...data, branch, projectId });
  return c.json({ id: result.sessionId, ...result }, 201);
});

sessionRoutes.get("/repos", async (c) => {
  const auth = c.get("auth");
  const forge = getForgeProviderForAuth(auth);
  const repos = await forge.repos.list();
  return c.json(repos);
});

sessionRoutes.get("/repos/:repoPath/branches", async (c) => {
  const auth = c.get("auth");
  const repoPath = decodeURIComponent(c.req.param("repoPath"));
  const [owner, repo] = repoPath.split("/");
  if (!owner || !repo) return c.json({ error: "Invalid repo path" }, 400);

  const forge = getForgeProviderForAuth(auth);
  const branches = await forge.branches.list(owner, repo);
  return c.json(branches);
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

  const requestId = c.req.header("x-request-id");
  const result = await getPlatform().sessions.sendMessage(auth, sessionId, {
    ...body.data,
    requestId: requestId ?? undefined,
  });

  if (result.isFirstMessage) {
    getPlatform().sessions.generateAutoTitle(sessionId, auth.userId).catch((err) => {
      console.error("[auto-title] Failed:", err);
    });
  }

  return c.json({ success: true, messageId: result.messageId, runId: result.runId });
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
