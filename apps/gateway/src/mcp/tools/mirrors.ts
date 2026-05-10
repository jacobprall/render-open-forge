import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerMirrorTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("list-mirrors", {
    title: "List Mirrors",
    description: "List repository mirrors.",
    inputSchema: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
  }, async ({ limit, offset }) => {
    const result = await p.mirrors.list(auth, { limit: limit ?? 50, offset: offset ?? 0 });
    return textResult(result);
  });

  server.registerTool("create-mirror", {
    title: "Create Mirror",
    description: "Create a new repository mirror.",
    inputSchema: z.object({
      syncConnectionId: z.string(),
      localRepoPath: z.string().describe("Local repository path (e.g. owner/repo)"),
      remoteRepoUrl: z.string().describe("Remote repository URL"),
      direction: z.enum(["pull", "push", "bidirectional"]),
      remoteToken: z.string().optional(),
      sessionId: z.string().optional(),
    }),
  }, async (args) => {
    const mirror = await p.mirrors.create(auth, args);
    return textResult(mirror);
  });

  server.registerTool("sync-mirror", {
    title: "Sync Mirror",
    description: "Trigger a sync for a mirror.",
    inputSchema: z.object({ mirrorId: z.string() }),
  }, async ({ mirrorId }) => {
    const result = await p.mirrors.sync(auth, mirrorId);
    return textResult(result);
  });

  server.registerTool("delete-mirror", {
    title: "Delete Mirror",
    description: "Delete a repository mirror.",
    inputSchema: z.object({ mirrorId: z.string() }),
  }, async ({ mirrorId }) => {
    await p.mirrors.delete(auth, mirrorId);
    return textResult({ ok: true });
  });

  server.registerTool("resolve-mirror-conflict", {
    title: "Resolve Mirror Conflict",
    description: "Resolve a conflict on a mirror.",
    inputSchema: z.object({
      mirrorId: z.string(),
      strategy: z.enum(["force-push", "manual", "rebase"]).optional(),
    }),
  }, async ({ mirrorId, strategy }) => {
    const result = await p.mirrors.resolveConflict(auth, mirrorId, strategy);
    return textResult(result);
  });
};
