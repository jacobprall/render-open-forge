import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { sessions } from "@render-open-forge/db";
import { getAdapter, getSessionId, isForgeAgentContext } from "../context/agent-context";
import { getDb } from "../db";

const MAX_PR_TITLE_LENGTH = 500;

function sanitizePrTitle(raw: string, fallback: string): string {
  const base = raw.replace(/[\r\n\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  const title = base.length > 0 ? base : fallback;
  return title.length > MAX_PR_TITLE_LENGTH ? title.slice(0, MAX_PR_TITLE_LENGTH) : title;
}

const createPrInputSchema = z.object({
  title: z.string().describe("Pull request title"),
  body: z.string().optional().describe("PR body in Markdown (optional)"),
  base: z.string().optional().describe("Target branch to merge into (defaults to session base branch)"),
});

export function createPullRequestTool() {
  return tool({
    description:
      "Create a pull request on the internal forge from the current branch. Push your branch with the git tool first. Returns the PR URL and number on success.",
    inputSchema: createPrInputSchema,
    execute: async ({ title, body, base: baseOpt }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) {
        return { success: false as const, error: "Agent context not available" };
      }

      const { forgejoClient, repoOwner, repoName, sessionId, baseBranch } = ctx;
      const adapter = getAdapter(experimental_context);

      const branchOut = await adapter.git(sessionId, ["branch", "--show-current"]);
      const head = branchOut.stdout.trim();
      if (!head) {
        return { success: false as const, error: "Could not determine current git branch" };
      }

      const base = baseOpt?.trim() || baseBranch;
      if (head === base) {
        return {
          success: false as const,
          error: `Current branch "${head}" is the base branch. Create a feature branch first.`,
        };
      }

      const prTitle = sanitizePrTitle(title, "Update");
      try {
        const pr = await forgejoClient.createPullRequest({
          owner: repoOwner,
          repo: repoName,
          head,
          base,
          title: prTitle,
          body: body?.trim() ?? "",
        });

        const db = getDb();
        await db
          .update(sessions)
          .set({ prNumber: pr.number, prStatus: "open", updatedAt: new Date() })
          .where(eq(sessions.id, sessionId));

        return {
          success: true as const,
          number: pr.number,
          url: pr.html_url,
          head,
          base,
          title: prTitle,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false as const, error: msg };
      }
    },
  });
}
