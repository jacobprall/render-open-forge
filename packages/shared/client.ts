/**
 * Browser-safe exports only — no `node:*`, Redis, or other server-only modules.
 * Use this entry from `use client` components.
 */
export {
  appendStreamEvent,
  type AssistantAskUserPart,
  type AssistantFileChangedPart,
  type AssistantPart,
  type AssistantTaskPart,
  type AssistantTextPart,
  type AssistantToolCallPart,
} from "./lib/chat-parts";

export type { StreamEvent } from "./lib/stream-types";

export {
  AppError,
  ForgeApiError,
  NotAuthenticatedError,
  SandboxError,
  SessionNotFoundError,
  ValidationError,
} from "./lib/errors";
export { isApiError, type ApiErrorResponse } from "./lib/api-types";

export {
  DEFAULT_MODEL_ID,
  filterModelsByCredentialAvailability,
  MODEL_DEFS,
  type ModelDef,
  type ModelSummary,
  toModelSummaries,
} from "./lib/model-catalog";
