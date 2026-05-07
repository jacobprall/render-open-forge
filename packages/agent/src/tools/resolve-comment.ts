import { tool } from "ai";
import { z } from "zod";
import { isForgeAgentContext } from "../context/agent-context";

export function resolveCommentTool() {
  return tool({
    description:
      "Resolve (or unresolve) a PR review comment by its numeric comment ID. Marks a review thread as addressed.",
    inputSchema: z.object({
      comment_id: z.number().int().positive().describe("Forgejo review comment ID to resolve"),
      unresolve: z.boolean().optional().describe("Pass true to unresolve instead of resolving"),
    }),
    execute: async ({ comment_id, unresolve }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        if (unresolve) {
          await ctx.forgejoClient.unresolveReviewComment(ctx.repoOwner, ctx.repoName, comment_id);
        } else {
          await ctx.forgejoClient.resolveReviewComment(ctx.repoOwner, ctx.repoName, comment_id);
        }
        return { success: true as const, resolved: !unresolve, commentId: comment_id };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}
