import { tool } from "ai";
import { z } from "zod";
import { isForgeAgentContext } from "../context/agent-context";

const methodSchema = z.enum(["merge", "rebase", "squash"]).optional();

export function mergePrTool() {
  return tool({
    description:
      "Merge an open pull request on the forge. Branch protection applies on the server.",
    inputSchema: z.object({
      number: z.number().int().positive().describe("Pull request number"),
      method: methodSchema.describe("Merge strategy (defaults to merge)"),
    }),
    execute: async ({ number, method }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        await ctx.forgejoClient.mergePullRequest(ctx.repoOwner, ctx.repoName, number, method ?? "merge");
        return { success: true as const, merged: number };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function closePrTool() {
  return tool({
    description: "Close a pull request without merging.",
    inputSchema: z.object({
      number: z.number().int().positive(),
    }),
    execute: async ({ number }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        await ctx.forgejoClient.patchPullRequest(ctx.repoOwner, ctx.repoName, number, {
          state: "closed",
        });
        return { success: true as const, closed: number };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function addPrCommentTool() {
  return tool({
    description: "Add a general PR comment on the forge (issue comment on the PR).",
    inputSchema: z.object({
      number: z.number().int().positive(),
      body: z.string().min(1),
    }),
    execute: async ({ number, body }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        await ctx.forgejoClient.createIssueComment(ctx.repoOwner, ctx.repoName, number, body);
        return { success: true as const };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function requestReviewTool() {
  return tool({
    description: "Request review from one or more forge users.",
    inputSchema: z.object({
      number: z.number().int().positive(),
      reviewers: z.array(z.string()).min(1),
    }),
    execute: async ({ number, reviewers }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        await ctx.forgejoClient.requestPullReviewers(ctx.repoOwner, ctx.repoName, number, reviewers);
        return { success: true as const };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function approvePrTool() {
  return tool({
    description: "Submit an approving PR review.",
    inputSchema: z.object({
      number: z.number().int().positive(),
      body: z.string().optional(),
    }),
    execute: async ({ number, body }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        await ctx.forgejoClient.createPullReview(ctx.repoOwner, ctx.repoName, number, "APPROVE", body);
        return { success: true as const };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function createRepoTool() {
  return tool({
    description:
      "Create a new repository under the Forgejo authenticated user namespace (requires permissions).",
    inputSchema: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      private: z.boolean().optional(),
      auto_init: z.boolean().optional(),
      default_branch: z.string().optional(),
    }),
    execute: async (params, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        const repo = await ctx.forgejoClient.createRepo({
          name: params.name,
          description: params.description,
          private: params.private,
          auto_init: params.auto_init ?? true,
          default_branch: params.default_branch ?? "main",
        });
        return { success: true as const, full_name: repo.full_name, clone_url: repo.clone_url };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function readBuildLogTool() {
  return tool({
    description:
      "Fetch plaintext CI job logs from Forgejo Actions for diagnosing failures.",
    inputSchema: z.object({
      job_id: z.union([z.string(), z.number()]),
      max_chars: z.number().optional(),
    }),
    execute: async ({ job_id, max_chars }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        const raw = await ctx.forgejoClient.getActionJobLogs(ctx.repoOwner, ctx.repoName, job_id);
        const cap = Math.min(Math.max(max_chars ?? 120_000, 1_000), 500_000);
        const text = raw.length <= cap ? raw : `\n...[truncated]...\n${raw.slice(raw.length - cap)}`;
        return { success: true as const, log: text, truncated: raw.length > cap };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

export function pullRequestDiffTool() {
  return tool({
    description:
      "Fetch unified diff text for an open PR (large results are truncated). Use before posting a review.",
    inputSchema: z.object({
      number: z.number().int().positive(),
      max_chars: z.number().optional(),
    }),
    execute: async ({ number, max_chars }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        const raw = await ctx.forgejoClient.getPullRequestDiff(ctx.repoOwner, ctx.repoName, number);
        const cap = Math.min(Math.max(max_chars ?? 120_000, 2_000), 500_000);
        const truncated = raw.length > cap;
        const text = truncated ? `${raw.slice(0, cap)}\n\n...[truncated ${raw.length - cap} chars]...` : raw;
        return { success: true as const, diff: text, total_chars: raw.length, truncated };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

const inlineNoteSchema = z.object({
  path: z.string().min(1),
  body: z.string().min(1),
  old_line_num: z.number().int().positive().optional(),
  new_line_num: z.number().int().positive().optional(),
});

export function reviewPrTool() {
  return tool({
    description:
      "Submit a pull request review (COMMENT) on the forge. Optionally attach inline file comments (Forgejo/Gitea review API).",
    inputSchema: z.object({
      number: z.number().int().positive(),
      summary: z.string().min(1).describe("Top-level review comment / summary"),
      inline_comments: z.array(inlineNoteSchema).optional(),
    }),
    execute: async ({ number, summary, inline_comments }, { experimental_context }) => {
      const ctx = isForgeAgentContext(experimental_context) ? experimental_context : null;
      if (!ctx) return { success: false as const, error: "Agent context not available" };
      try {
        const comments =
          inline_comments?.map((c) => {
            const row: Record<string, unknown> = { path: c.path, body: c.body };
            if (c.old_line_num != null) row.old_line_num = c.old_line_num;
            if (c.new_line_num != null) row.new_line_num = c.new_line_num;
            return row;
          }) ?? [];
        await ctx.forgejoClient.createPullReview(
          ctx.repoOwner,
          ctx.repoName,
          number,
          "COMMENT",
          summary,
          comments.length ? comments : undefined,
        );
        return { success: true as const, reviewed: number };
      } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}
