import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerSkillTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-skills", {
    title: "List Skills",
    description: "List available skills (builtin, user, and optionally repo-specific).",
    inputSchema: z.object({
      repoPath: z.string().optional().describe("Include repo-specific skills"),
    }),
  }, async ({ repoPath }) => {
    const result = await p.skills.listSkills(auth, repoPath);
    return textResult(result);
  });

  server.registerTool("list-repo-skills", {
    title: "List Repo Skills",
    description: "List skills defined in a specific repository.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
    }),
  }, async ({ owner, repo }) => {
    const result = await p.skills.listRepoSkills(auth, owner, repo);
    return textResult(result);
  });

  server.registerTool("install-skill", {
    title: "Install Skill",
    description: "Install a skill from a URL into the user's skill repository.",
    inputSchema: z.object({
      url: z.string().describe("URL to the skill markdown file"),
      slug: z.string().optional().describe("Custom slug for the skill"),
    }),
  }, async (args) => {
    const result = await p.skills.installSkill(auth, args);
    return textResult(result);
  });

  server.registerTool("sync-skills", {
    title: "Sync Skills",
    description: "Synchronize skills from remote sources.",
  }, async () => {
    await p.skills.syncSkills(auth);
    return textResult({ ok: true });
  });
};
