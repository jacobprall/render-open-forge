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

// Forgejo client
export { ForgejoClient } from "./lib/forgejo/client";
export { getBranchProtection, setBranchProtection, normalizeBranchProtectionList } from "./lib/forgejo/branch-protection";
export {
  addInlineComment,
  listPRComments,
  listPRReviews,
  resolveComment,
  submitReview,
  unresolveComment,
  type PRComment,
  type PRReview,
} from "./lib/forgejo/review-service";
export {
  createCommitStatus,
  getCombinedStatus,
  getWorkflowTemplate,
  WORKFLOW_TEMPLATES,
  type CommitStatus,
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

// Model catalog
export {
  DEFAULT_MODEL_ID,
  filterModelsByCredentialAvailability,
  MODEL_DEFS,
  type ModelDef,
  type ModelSummary,
  toModelSummaries,
} from "./lib/model-catalog";
