/**
 * Forge Provider — normalized types for git forge operations.
 *
 * These types are forge-agnostic. Every provider (Forgejo, GitHub, GitLab)
 * maps its native API responses into these shapes.
 */

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface ForgeRepo {
  id: number | string;
  fullName: string;
  name: string;
  owner: string;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  isPrivate: boolean;
  description: string;
}

export interface ForgeBranch {
  name: string;
  commitSha: string;
  commitMessage: string;
}

export interface ForgePullRequest {
  id: number | string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  merged: boolean;
  htmlUrl: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForgeFileContent {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  content?: string;
  encoding?: string;
  size: number;
  sha: string;
}

export interface ForgeCommit {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  htmlUrl: string;
}

export interface ForgeReview {
  id: number | string;
  author: string;
  state: "approved" | "changes_requested" | "commented" | "pending" | "dismissed";
  body: string;
  submittedAt: string;
}

export interface ForgeComment {
  id: number | string;
  author: string;
  avatarUrl: string;
  body: string;
  path?: string;
  line?: number;
  oldLine?: number;
  isResolved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ForgeUser {
  id: number | string;
  username: string;
  email: string;
  avatarUrl: string;
}

export interface ForgeOrg {
  id: number | string;
  name: string;
  fullName: string;
  avatarUrl: string;
  description: string;
}

export interface ForgeOrgMember {
  id: number | string;
  username: string;
  avatarUrl: string;
}

export interface ForgeArtifact {
  id: number | string;
  name: string;
  sizeBytes: number;
  createdAt?: string;
}

export interface ForgeCommitStatus {
  state: "pending" | "success" | "failure" | "error";
  targetUrl?: string;
  description?: string;
  context: string;
}

export interface ForgeCombinedStatus {
  state: string;
  totalCount: number;
  statuses: ForgeCommitStatus[];
}

// ─── Params ──────────────────────────────────────────────────────────────────

export interface CreateRepoParams {
  name: string;
  description?: string;
  isPrivate?: boolean;
  autoInit?: boolean;
  defaultBranch?: string;
}

export interface CreatePRParams {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
}

export interface PutFileParams {
  content: string;
  message: string;
  sha?: string;
  branch?: string;
}

export interface DeleteFileParams {
  message: string;
  sha: string;
  branch?: string;
}

export interface MigrateRepoParams {
  cloneAddr: string;
  repoName: string;
  repoOwner?: string;
  mirror?: boolean;
  service?: "git" | "github" | "gitlab" | "gitea" | "forgejo";
  authToken?: string;
}

export interface InlineCommentParams {
  body: string;
  path: string;
  newLine?: number;
  oldLine?: number;
}

export type ReviewEvent = "approve" | "request_changes" | "comment";

export type MergeMethod = "merge" | "rebase" | "squash";

export interface BranchProtectionRule {
  name: string;
  pattern: string;
  requiredApprovals: number;
  requireStatusChecks: boolean;
  statusCheckContexts: string[];
  blockForcePush: boolean;
  raw: Record<string, unknown>;
}

// ─── Mirror Abstraction ──────────────────────────────────────────────────────

export type MirrorDirection = "pull" | "push" | "bidirectional";
export type ConflictStrategy = "force-push" | "manual" | "rebase";

export interface MirrorConfig {
  remoteUrl: string;
  remoteToken: string;
  direction: MirrorDirection;
  interval?: string;
  syncOnCommit?: boolean;
}

export interface MirrorSyncResult {
  success: boolean;
  error?: string;
}

export interface MirrorConflictResult {
  resolved: boolean;
  strategy: ConflictStrategy;
  error?: string;
}

// ─── Webhook Abstraction ─────────────────────────────────────────────────────

export type ForgeWebhookEventType =
  | "push"
  | "pull_request"
  | "pull_request_review"
  | "pull_request_comment"
  | "issue_comment"
  | "workflow_run"
  | "status"
  | "unknown";

export interface ForgeWebhookEvent {
  type: ForgeWebhookEventType;
  action?: string;
  repo: { owner: string; name: string; fullName: string };
  sender: string;
  raw: unknown;
}

export interface ForgePushEvent extends ForgeWebhookEvent {
  type: "push";
  ref: string;
  branch: string;
  before: string;
  after: string;
  commits: Array<{ id: string; message: string; added: string[]; removed: string[]; modified: string[] }>;
}

export interface ForgePREvent extends ForgeWebhookEvent {
  type: "pull_request";
  action: "opened" | "closed" | "merged" | "reopened" | "synchronized" | string;
  pullRequest: ForgePullRequest;
}

export interface ForgeReviewCommentEvent extends ForgeWebhookEvent {
  type: "pull_request_comment" | "issue_comment";
  action: "created" | "edited" | "deleted" | string;
  comment: ForgeComment;
  issueNumber: number;
}

export interface ForgeWorkflowRunEvent extends ForgeWebhookEvent {
  type: "workflow_run";
  action: "completed" | "requested" | string;
  workflowName: string;
  runId: number | string;
  conclusion: "success" | "failure" | "cancelled" | string;
  headBranch: string;
  headSha: string;
}

export interface ForgeStatusEvent extends ForgeWebhookEvent {
  type: "status";
  sha: string;
  state: string;
  context: string;
  targetUrl?: string;
  description?: string;
}

// ─── Auth Abstraction ────────────────────────────────────────────────────────

export interface ForgeTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ─── CI Abstraction ──────────────────────────────────────────────────────────

export interface ForgeWorkflowTemplate {
  name: string;
  path: string;
  content: string;
}
