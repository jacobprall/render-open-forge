/**
 * Browser-safe exports only — no `node:*`, Redis, or other server-only modules.
 * Use this entry from `use client` components.
 */
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
  MODEL_DEFS,
  type ModelDef,
  type ModelSummary,
} from "./lib/model-catalog";
