// Hooks
export {
  ExpandedViewProvider,
  useExpandedView,
} from "./hooks/expanded-view-context";
export {
  ReasoningProvider,
  type ThinkingState,
  useReasoningContext,
} from "./hooks/reasoning-context";
export { TodoViewProvider, useTodoView } from "./hooks/todo-view-context";

// Lib - Diff utilities
export {
  type CodeLine,
  createEditDiffLines,
  createNewFileCodeLines,
  createUnifiedDiff,
  DIFF_LINE_MAX_WIDTH,
  DIFF_MAX_EDIT_LINES,
  type DiffLine,
  getLanguageFromPath,
  type Highlighter,
  NEW_FILE_MAX_LINES,
  splitLines,
  type UnifiedDiffResult,
} from "./lib/diff";

// Lib - Paste blocks
export {
  countLines,
  createPasteToken,
  expandPasteTokens,
  extractPasteTokens,
  formatPastePlaceholder,
  isPasteTokenChar,
  PASTE_TOKEN_BASE,
  PASTE_TOKEN_END,
  type PasteBlock,
} from "./lib/paste-blocks";

// Lib - Tool state utilities
export {
  extractRenderState,
  formatTokens,
  type GenericToolPart,
  getStatusColor,
  getStatusLabel,
  type ToolRenderState,
  toRelativePath,
} from "./lib/tool-state";

// Lib - Stream event types
export type { StreamEvent } from "./lib/stream-types";

// Lib - Chat parts reducer
export {
  appendStreamEvent,
  type AssistantAskUserPart,
  type AssistantFileChangedPart,
  type AssistantPart,
  type AssistantTaskPart,
  type AssistantTextPart,
  type AssistantToolCallPart,
} from "./lib/chat-parts";

// Lib - Errors + API + logging + request id
export {
  AgentError,
  AppError,
  AuthError,
  ChatCorruptedError,
  ChatError,
  ExecTimeoutError,
  ForgeApiError,
  ForgeError,
  ForgeUnreachableError,
  InsufficientPermissionsError,
  MaxStepsExceededError,
  ModelOverloadedError,
  ModelRateLimitedError,
  NotAuthenticatedError,
  PathTraversalError,
  RedisStreamError,
  RunAbortedError,
  SandboxError,
  SandboxProviderNotFoundError,
  SandboxUnreachableError,
  SessionArchivedError,
  SessionError,
  SessionExpiredError,
  SessionNotFoundError,
  ValidationError,
} from "./lib/errors";
export type { AppErrorOptions } from "./lib/errors";
export { generateRequestId, getRequestIdFromHeaders } from "./lib/request-id";
export type { ApiErrorResponse, ApiResponse, ApiSuccessResponse } from "./lib/api-types";
export { isApiError } from "./lib/api-types";
export { logger } from "./lib/logger";

// Forge provider abstraction
export { ForgejoProvider, createForgeProvider, getDefaultForgeProvider } from "./lib/forge";
export type {
  ForgeProvider,
  ForgeProviderType,
  ForgeProviderConfig,
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
  ForgeWebhookEvent,
  ForgePushEvent,
  ForgePREvent,
  ForgeWorkflowRunEvent,
  ForgeStatusEvent,
  MirrorConfig,
  MirrorSyncResult,
  MirrorConflictResult,
  BranchProtectionRule,
  CreateRepoParams,
  CreatePRParams,
  MirrorDirection,
  ConflictStrategy,
  ReviewEvent,
  MergeMethod,
} from "./lib/forge";
export {
  getWorkflowTemplate,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplateKey,
} from "./lib/forgejo/ci-helpers";
export {
  verifyForgejoWebhookSignature,
  isForgejoWebhookVerificationConfigured,
  shouldAllowUnsignedForgejoWebhooks,
} from "./lib/forgejo/webhook-signature";

// Redis Streams agent job queue
export {
  AGENT_JOBS_GROUP,
  AGENT_JOBS_STREAM,
  AgentJobSchema,
  ackJob,
  enqueueJob,
  ensureConsumerGroup,
  reclaimStalePending,
  readOneJob,
  type ValidatedAgentJob,
} from "./lib/job-queue";

// Run event stream
export {
  askUserReplyQueueKey,
  publishRunEvent,
  readRunEventHistory,
  readRunEventHistoryDetailed,
  readRunEventPayloadsAfterId,
  runEventStreamKey,
} from "./lib/run-stream";

// CI test-result parsers
export {
  parseJUnitXML,
  parseTAPOutput,
  type TestCase,
  type TestResultSummary,
  type TestSuite,
} from "./lib/ci/test-results";

// Model catalog (OpenAI only — Anthropic is fetched live, see apps/agent/src/models.ts)
export {
  MODEL_DEFS,
  type ModelDef,
  type ModelSummary,
} from "./lib/model-catalog";

// LLM API keys (encrypted storage + resolution)
export {
  decryptLlmApiKey,
  encryptLlmApiKey,
  isLlmKeyEncryptionConfigured,
} from "./lib/encryption";
export {
  llmKeyHint,
  validateAnthropicApiKey,
  validateOpenAiApiKey,
} from "./lib/llm-key-validation";
export { resolveLlmApiKeys, type ResolvedLlmKeys } from "./lib/api-key-resolver";
