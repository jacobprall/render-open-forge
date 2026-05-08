/**
 * Barrel export for the forge abstraction layer.
 *
 * Usage:
 *   import { createForgeProvider, getDefaultForgeProvider } from "@openforge/platform/forge";
 *   import type { ForgeProvider, ForgeRepo, ForgePullRequest } from "@openforge/platform/forge";
 */

// Normalized types
export type {
  ForgeRepo,
  ForgeBranch,
  ForgePullRequest,
  ForgeFileContent,
  ForgeCommit,
  ForgeReview,
  ForgeComment,
  ForgeUser,
  ForgeOrg,
  ForgeOrgMember,
  ForgeArtifact,
  ForgeCommitStatus,
  ForgeCombinedStatus,
  ForgeTokenResult,
  ForgeWebhookEvent,
  ForgePushEvent,
  ForgePREvent,
  ForgeReviewCommentEvent,
  ForgeWorkflowRunEvent,
  ForgeStatusEvent,
  ForgeWorkflowTemplate,
  MirrorConfig,
  MirrorSyncResult,
  MirrorConflictResult,
  BranchProtectionRule,
  CreateRepoParams,
  CreatePRParams,
  PutFileParams,
  DeleteFileParams,
  MigrateRepoParams,
  InlineCommentParams,
  ReviewEvent,
  MergeMethod,
  ConflictStrategy,
  MirrorDirection,
  ForgeWebhookEventType,
} from "./types";

// Provider interface + capability interfaces
export type {
  ForgeProvider,
  ForgeProviderType,
  RepoOperations,
  FileOperations,
  BranchOperations,
  CommitOperations,
  PullRequestOperations,
  ReviewOperations,
  CIOperations,
  RepoSecretOperations,
  OrgSecretOperations,
  OrgOperations,
  MirrorOperations,
  AuthOperations,
  WebhookOperations,
  GitOperations,
} from "./provider";

// Concrete adapters
export { ForgejoProvider } from "./forgejo-adapter";

// Factory
export { createForgeProvider, getDefaultForgeProvider } from "./factory";
export type { ForgeProviderConfig } from "./factory";
