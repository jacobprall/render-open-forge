import { z } from "zod";
import type { ToolRegistrar } from "./helpers";
import { textResult } from "./helpers";

export const registerPullRequestTools: ToolRegistrar = (server, p, auth) => {
  server.registerTool("create-pull-request", {
    title: "Create Pull Request",
    description: "Open a new pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string(),
      head: z.string().describe("Source branch"),
      base: z.string().describe("Target branch"),
      body: z.string().optional(),
    }),
  }, async ({ owner, repo, ...params }) => {
    const result = await p.pullRequests.createPullRequest(auth, owner, repo, params);
    return textResult(result);
  });

  server.registerTool("update-pull-request", {
    title: "Update Pull Request",
    description: "Update a pull request's state or title.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      state: z.enum(["open", "closed"]).optional(),
      title: z.string().optional(),
    }),
  }, async ({ owner, repo, number, ...data }) => {
    const result = await p.pullRequests.updatePullRequest(auth, owner, repo, number, data);
    return textResult(result);
  });

  server.registerTool("merge-pull-request", {
    title: "Merge Pull Request",
    description: "Merge an open pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      method: z.enum(["merge", "rebase", "squash"]).optional(),
    }),
  }, async ({ owner, repo, number, method }) => {
    const result = await p.pullRequests.mergePullRequest(auth, owner, repo, number, method);
    return textResult(result);
  });

  server.registerTool("list-pr-comments", {
    title: "List PR Comments",
    description: "List comments on a pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
    }),
  }, async ({ owner, repo, number }) => {
    const result = await p.pullRequests.listComments(auth, owner, repo, number);
    return textResult(result);
  });

  server.registerTool("create-pr-comment", {
    title: "Create PR Comment",
    description: "Post a comment on a pull request. Supports inline comments on specific lines.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      body: z.string(),
      path: z.string().optional().describe("File path for inline comment"),
      newLine: z.number().optional().describe("Line number in the new file"),
      oldLine: z.number().optional().describe("Line number in the old file"),
    }),
  }, async ({ owner, repo, number, ...data }) => {
    const result = await p.pullRequests.createComment(auth, owner, repo, number, data);
    return textResult(result);
  });

  server.registerTool("resolve-pr-comment", {
    title: "Resolve PR Comment",
    description: "Mark a PR comment thread as resolved or unresolve it.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      commentId: z.number(),
      unresolve: z.boolean().optional().describe("Set true to unresolve"),
    }),
  }, async ({ owner, repo, commentId, unresolve }) => {
    const result = await p.pullRequests.resolveComment(auth, owner, repo, commentId, unresolve);
    return textResult(result);
  });

  server.registerTool("list-pr-reviews", {
    title: "List PR Reviews",
    description: "List reviews on a pull request.",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
    }),
  }, async ({ owner, repo, number }) => {
    const reviews = await p.pullRequests.listReviews(auth, owner, repo, number);
    return textResult(reviews);
  });

  server.registerTool("submit-pr-review", {
    title: "Submit PR Review",
    description: "Submit a review on a pull request (approve, request changes, or comment).",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      number: z.number(),
      event: z.enum(["approve", "request_changes", "comment"]),
      body: z.string().optional(),
      comments: z.array(z.object({
        body: z.string(),
        path: z.string(),
        newLine: z.number().optional(),
        oldLine: z.number().optional(),
      })).optional().describe("Inline review comments"),
    }),
  }, async ({ owner, repo, number, ...data }) => {
    const result = await p.pullRequests.submitReview(auth, owner, repo, number, data);
    return textResult(result);
  });
};
