import { Hono } from "hono";
import { z } from "zod";
import type { GatewayEnv } from "../middleware/auth";
import { getPlatform } from "../platform";

export const pullRoutes = new Hono<GatewayEnv>();

// ---------------------------------------------------------------------------
// POST /:owner/:repo — create PR
// ---------------------------------------------------------------------------

const CreatePullRequestSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  head: z.string(),
  base: z.string(),
});

pullRoutes.post("/:owner/:repo", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const body = CreatePullRequestSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await getPlatform().pullRequests.createPullRequest(auth, owner, repo, body.data);
  return c.json(result, 201);
});

// ---------------------------------------------------------------------------
// PATCH /:owner/:repo/:number — update PR
// ---------------------------------------------------------------------------

const UpdatePullRequestSchema = z.object({
  state: z.enum(["open", "closed"]).optional(),
  title: z.string().optional(),
});

pullRoutes.patch("/:owner/:repo/:number", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number(c.req.param("number"));
  const body = UpdatePullRequestSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await getPlatform().pullRequests.updatePullRequest(auth, owner, repo, number, body.data);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /:owner/:repo/:number/merge
// ---------------------------------------------------------------------------

const MergePullRequestSchema = z
  .object({ method: z.enum(["merge", "rebase", "squash"]).optional() })
  .optional();

pullRoutes.post("/:owner/:repo/:number/merge", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number(c.req.param("number"));
  const raw = await c.req.json().catch(() => ({}));
  const body = MergePullRequestSchema.safeParse(raw);
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  await getPlatform().pullRequests.mergePullRequest(auth, owner, repo, number, body.data?.method);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /:owner/:repo/:number/comments
// ---------------------------------------------------------------------------

pullRoutes.get("/:owner/:repo/:number/comments", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number(c.req.param("number"));
  const comments = await getPlatform().pullRequests.listComments(auth, owner, repo, number);
  return c.json(comments);
});

// ---------------------------------------------------------------------------
// POST /:owner/:repo/:number/comments
// ---------------------------------------------------------------------------

const CreateCommentSchema = z.object({
  body: z.string(),
  path: z.string().optional(),
  newLine: z.number().optional(),
  oldLine: z.number().optional(),
});

pullRoutes.post("/:owner/:repo/:number/comments", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number(c.req.param("number"));
  const body = CreateCommentSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const comment = await getPlatform().pullRequests.createComment(auth, owner, repo, number, body.data);
  return c.json(comment, 201);
});

// ---------------------------------------------------------------------------
// POST /:owner/:repo/:number/comments/:commentId/resolve
// ---------------------------------------------------------------------------

const ResolveCommentSchema = z
  .object({ unresolve: z.boolean().optional() })
  .optional();

pullRoutes.post("/:owner/:repo/:number/comments/:commentId/resolve", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const commentId = Number(c.req.param("commentId"));
  const raw = await c.req.json().catch(() => ({}));
  const body = ResolveCommentSchema.safeParse(raw);
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await getPlatform().pullRequests.resolveComment(
    auth, owner, repo, commentId, body.data?.unresolve,
  );
  return c.json(result);
});

// ---------------------------------------------------------------------------
// GET /:owner/:repo/:number/reviews
// ---------------------------------------------------------------------------

pullRoutes.get("/:owner/:repo/:number/reviews", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number(c.req.param("number"));
  const reviews = await getPlatform().pullRequests.listReviews(auth, owner, repo, number);
  return c.json(reviews);
});

// ---------------------------------------------------------------------------
// POST /:owner/:repo/:number/reviews
// ---------------------------------------------------------------------------

const SubmitReviewSchema = z.object({
  event: z.enum(["approve", "request_changes", "comment"]),
  body: z.string().optional(),
  comments: z
    .array(
      z.object({
        body: z.string(),
        path: z.string(),
        newLine: z.number().optional(),
        oldLine: z.number().optional(),
      }),
    )
    .optional(),
});

pullRoutes.post("/:owner/:repo/:number/reviews", async (c) => {
  const auth = c.get("auth");
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number(c.req.param("number"));
  const body = SubmitReviewSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const review = await getPlatform().pullRequests.submitReview(auth, owner, repo, number, body.data);
  return c.json(review, 201);
});
