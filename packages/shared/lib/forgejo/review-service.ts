/**
 * Code review service wrappers around ForgejoClient.
 */
import type { ForgejoClient } from "./client";

export interface PRComment {
  id: number;
  body: string;
  user: { login: string; avatar_url?: string };
  path?: string;
  line?: number;
  oldLine?: number;
  diffHunk?: string;
  resolved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PRReview {
  id: number;
  user: { login: string; avatar_url?: string };
  state: string;
  body: string;
  createdAt: string;
  comments: PRComment[];
}

function normalizeComment(raw: Record<string, unknown>): PRComment {
  const user = (raw.user ?? raw.poster ?? {}) as Record<string, unknown>;
  return {
    id: Number(raw.id),
    body: String(raw.body ?? ""),
    user: {
      login: String(user.login ?? user.username ?? "unknown"),
      avatar_url: typeof user.avatar_url === "string" ? user.avatar_url : undefined,
    },
    path: typeof raw.path === "string" ? raw.path : undefined,
    line: typeof raw.line === "number" ? raw.line : typeof raw.new_position === "number" ? raw.new_position : undefined,
    oldLine: typeof raw.old_position === "number" ? raw.old_position : undefined,
    diffHunk: typeof raw.diff_hunk === "string" ? raw.diff_hunk : undefined,
    resolved: typeof raw.resolved === "boolean" ? raw.resolved : undefined,
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? raw.created_at ?? ""),
  };
}

function normalizeReview(raw: Record<string, unknown>): PRReview {
  const user = (raw.user ?? raw.reviewer ?? {}) as Record<string, unknown>;
  return {
    id: Number(raw.id),
    user: {
      login: String(user.login ?? user.username ?? "unknown"),
      avatar_url: typeof user.avatar_url === "string" ? user.avatar_url : undefined,
    },
    state: String(raw.state ?? raw.stale === true ? "stale" : "pending"),
    body: String(raw.body ?? ""),
    createdAt: String(raw.submitted_at ?? raw.created_at ?? ""),
    comments: [],
  };
}

/** All review comments (inline + general issue comments) on a PR. */
export async function listPRComments(
  client: ForgejoClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRComment[]> {
  const [inlineRaw, issueRaw] = await Promise.all([
    client.listPullReviewComments(owner, repo, prNumber).catch(() => []),
    client.listIssueComments(owner, repo, prNumber).catch(() => []),
  ]);
  const inline = (Array.isArray(inlineRaw) ? inlineRaw : []).map(normalizeComment);
  const issue = (Array.isArray(issueRaw) ? issueRaw : []).map(normalizeComment);
  const all = [...inline, ...issue];
  all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return all;
}

export async function listPRReviews(
  client: ForgejoClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRReview[]> {
  const raw = await client.listPullReviews(owner, repo, prNumber).catch(() => []);
  return (Array.isArray(raw) ? raw : []).map(normalizeReview);
}

export async function addInlineComment(
  client: ForgejoClient,
  owner: string,
  repo: string,
  prNumber: number,
  path: string,
  body: string,
  newLineNum?: number,
  oldLineNum?: number,
): Promise<PRComment> {
  const raw = await client.createPullReviewComment(
    owner,
    repo,
    prNumber,
    body,
    path,
    newLineNum,
    oldLineNum,
  );
  return normalizeComment(raw);
}

export async function resolveComment(
  client: ForgejoClient,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  await client.resolveReviewComment(owner, repo, commentId);
}

export async function unresolveComment(
  client: ForgejoClient,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  await client.unresolveReviewComment(owner, repo, commentId);
}

export async function submitReview(
  client: ForgejoClient,
  owner: string,
  repo: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string,
  inlineComments?: Array<{ path: string; body: string; new_line_num?: number; old_line_num?: number }>,
): Promise<PRReview> {
  const comments = inlineComments?.map((c) => {
    const o: Record<string, unknown> = { path: c.path, body: c.body };
    if (c.new_line_num != null) o.new_line_num = c.new_line_num;
    if (c.old_line_num != null) o.old_line_num = c.old_line_num;
    return o;
  });
  const raw = await client.createPullReview(owner, repo, prNumber, event, body, comments);
  return normalizeReview(raw);
}
