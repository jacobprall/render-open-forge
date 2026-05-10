import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerProjectTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-projects", {
    title: "List Projects",
    description: "List all projects for the current user.",
  }, async () => {
    const projects = await p.projects.list(auth);
    return textResult(projects);
  });

  server.registerTool("create-project", {
    title: "Create Project",
    description: "Create a new project.",
    inputSchema: z.object({
      name: z.string().min(1),
      slug: z.string().optional(),
      instructions: z.string().optional().describe("Custom instructions for the agent"),
      config: z.record(z.string(), z.unknown()).optional(),
      repoPath: z.string().optional().describe("Attach a repo (e.g. owner/repo)"),
      forgeType: z.enum(["forgejo", "github", "gitlab"]).optional(),
    }),
  }, async (args) => {
    const project = await p.projects.create(auth, args);
    return textResult(project);
  });

  server.registerTool("get-project", {
    title: "Get Project",
    description: "Get details of a project by ID.",
    inputSchema: z.object({ projectId: z.string() }),
  }, async ({ projectId }) => {
    const project = await p.projects.get(auth, projectId);
    if (!project) return textResult({ error: "Project not found" });
    return textResult(project);
  });

  server.registerTool("update-project", {
    title: "Update Project",
    description: "Update a project's name, slug, instructions, or config.",
    inputSchema: z.object({
      projectId: z.string(),
      name: z.string().min(1).optional(),
      slug: z.string().optional(),
      instructions: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }),
  }, async ({ projectId, ...data }) => {
    const project = await p.projects.update(auth, projectId, data);
    return textResult(project);
  });

  server.registerTool("delete-project", {
    title: "Delete Project",
    description: "Delete a project.",
    inputSchema: z.object({ projectId: z.string() }),
  }, async ({ projectId }) => {
    await p.projects.delete(auth, projectId);
    return textResult({ ok: true });
  });

  server.registerTool("add-project-repo", {
    title: "Add Repo to Project",
    description: "Associate a repository with a project.",
    inputSchema: z.object({
      projectId: z.string(),
      repoPath: z.string().describe("Repository path (e.g. owner/repo)"),
      forgeType: z.string().optional(),
      defaultBranch: z.string().optional(),
    }),
  }, async ({ projectId, ...data }) => {
    const repo = await p.projects.addRepo(auth, projectId, data);
    return textResult(repo);
  });

  server.registerTool("remove-project-repo", {
    title: "Remove Repo from Project",
    description: "Dissociate a repository from a project.",
    inputSchema: z.object({
      projectId: z.string(),
      repoPath: z.string().describe("Repository path (e.g. owner/repo)"),
    }),
  }, async ({ projectId, repoPath }) => {
    await p.projects.removeRepo(auth, projectId, repoPath);
    return textResult({ ok: true });
  });
};
