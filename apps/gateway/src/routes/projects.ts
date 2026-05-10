import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const projectRoutes = new Hono<GatewayEnv>();

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  instructions: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  repoPath: z.string().optional(),
  forgeType: z.enum(["forgejo", "github", "gitlab"]).optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  instructions: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const AddRepoSchema = z.object({
  repoPath: z.string().min(1),
  forgeType: z.string().optional(),
  defaultBranch: z.string().optional(),
});

projectRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const list = await getPlatform().projects.list(auth);
  return c.json({ projects: list });
});

projectRoutes.post("/", async (c) => {
  const auth = c.get("auth");
  const body = CreateProjectSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const project = await getPlatform().projects.create(auth, body.data);
  return c.json(project, 201);
});

projectRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");
  const project = await getPlatform().projects.get(auth, c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json(project);
});

projectRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const body = UpdateProjectSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const project = await getPlatform().projects.update(auth, c.req.param("id"), body.data);
  return c.json(project);
});

projectRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth");
  await getPlatform().projects.delete(auth, c.req.param("id"));
  return c.json({ ok: true });
});

projectRoutes.post("/:id/repos", async (c) => {
  const auth = c.get("auth");
  const body = AddRepoSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const repo = await getPlatform().projects.addRepo(auth, c.req.param("id"), body.data);
  return c.json(repo, 201);
});

projectRoutes.delete("/:id/repos/:repoPath{.+}", async (c) => {
  const auth = c.get("auth");
  const repoPath = decodeURIComponent(c.req.param("repoPath"));
  await getPlatform().projects.removeRepo(auth, c.req.param("id"), repoPath);
  return c.json({ ok: true });
});
