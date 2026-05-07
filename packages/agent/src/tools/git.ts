import { tool } from "ai";
import { z } from "zod";
import { getSandboxContext, isForgeAgentContext } from "../context/agent-context";

const gitInputSchema = z.object({
  args: z.array(z.string()).describe("Git command arguments (e.g. ['status'] or ['add', '-A'])"),
});

const GIT_COMMANDS_NEEDING_AUTH = new Set(["push", "fetch", "pull"]);

export function gitTool() {
  return tool({
    description:
      "Run a git command in the session workspace. For push/fetch/pull, authentication is handled automatically via the internal forge. Use this instead of bash for git operations.",
    inputSchema: gitInputSchema,
    execute: async ({ args }, { experimental_context }) => {
      const { adapter, sessionId } = getSandboxContext(experimental_context);

      const subcommand = args[0]?.toLowerCase();
      const needsAuth = subcommand && GIT_COMMANDS_NEEDING_AUTH.has(subcommand);

      if (needsAuth && isForgeAgentContext(experimental_context)) {
        const { forge, repoOwner, repoName } = experimental_context;
        const authUrl = forge.git.authenticatedCloneUrl(repoOwner, repoName);
        const plainUrl = forge.git.plainCloneUrl(repoOwner, repoName);

        await adapter.git(sessionId, ["remote", "set-url", "origin", authUrl]);
        try {
          return await adapter.git(sessionId, args);
        } finally {
          await adapter.git(sessionId, ["remote", "set-url", "origin", plainUrl]).catch(() => {});
        }
      }

      return await adapter.git(sessionId, args);
    },
  });
}
