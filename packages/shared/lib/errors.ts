export interface AppErrorOptions {
  code: string;
  message: string;
  httpStatus: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(opts: AppErrorOptions) {
    super(opts.message, { cause: opts.cause });
    this.name = this.constructor.name;
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details ?? {};
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(Object.keys(this.details).length > 0 ? { details: this.details } : {}),
      },
    };
  }
}

type ExtraErrorFields = Partial<Omit<AppErrorOptions, "code" | "httpStatus" | "message">>;

// --- Auth ---
export class AuthError extends AppError {}
export class NotAuthenticatedError extends AuthError {
  constructor(message = "Not authenticated", opts: ExtraErrorFields = {}) {
    super({ code: "NOT_AUTHENTICATED", message, httpStatus: 401, ...opts });
  }
}
export class InsufficientPermissionsError extends AuthError {
  constructor(message = "Insufficient permissions", opts: ExtraErrorFields = {}) {
    super({ code: "INSUFFICIENT_PERMISSIONS", message, httpStatus: 403, ...opts });
  }
}

// --- Forge ---
export class ForgeError extends AppError {}
export class ForgeUnreachableError extends ForgeError {
  constructor(message = "Forge unreachable", opts: ExtraErrorFields = {}) {
    super({ code: "FORGE_UNREACHABLE", message, httpStatus: 503, retryable: true, ...opts });
  }
}
export class ForgeApiError extends ForgeError {
  constructor(message = "Forge API error", opts: ExtraErrorFields = {}) {
    super({ code: "FORGE_API_ERROR", message, httpStatus: 502, ...opts });
  }
}

// --- Sandbox ---
export class SandboxError extends AppError {}
export class SandboxUnreachableError extends SandboxError {
  constructor(message = "Sandbox unreachable", opts: ExtraErrorFields = {}) {
    super({ code: "SANDBOX_UNREACHABLE", message, httpStatus: 503, retryable: true, ...opts });
  }
}
export class ExecTimeoutError extends SandboxError {
  constructor(message = "Command timed out", opts: ExtraErrorFields = {}) {
    super({ code: "EXEC_TIMEOUT", message, httpStatus: 408, ...opts });
  }
}
export class PathTraversalError extends SandboxError {
  constructor(message = "Invalid path", opts: ExtraErrorFields = {}) {
    super({ code: "PATH_TRAVERSAL", message, httpStatus: 400, ...opts });
  }
}
export class SandboxProviderNotFoundError extends SandboxError {
  constructor(type: string) {
    super({
      code: "SANDBOX_PROVIDER_NOT_FOUND",
      message: `Sandbox provider not registered: ${type}`,
      httpStatus: 500,
    });
  }
}

// --- Agent / model ---
export class AgentError extends AppError {}
export class ModelRateLimitedError extends AgentError {
  constructor(message = "Model rate limited", opts: ExtraErrorFields = {}) {
    super({ code: "MODEL_RATE_LIMITED", message, httpStatus: 429, retryable: true, ...opts });
  }
}
export class ModelOverloadedError extends AgentError {
  constructor(message = "Model overloaded", opts: ExtraErrorFields = {}) {
    super({ code: "MODEL_OVERLOADED", message, httpStatus: 503, retryable: true, ...opts });
  }
}
export class MaxStepsExceededError extends AgentError {
  constructor(message = "Max steps exceeded", opts: ExtraErrorFields = {}) {
    super({ code: "MAX_STEPS_EXCEEDED", message, httpStatus: 422, ...opts });
  }
}
export class RunAbortedError extends AgentError {
  constructor(message = "Run aborted", opts: ExtraErrorFields = {}) {
    super({ code: "RUN_ABORTED", message, httpStatus: 409, ...opts });
  }
}

// --- Session ---
export class SessionError extends AppError {}
export class SessionNotFoundError extends SessionError {
  constructor(message = "Session not found", opts: ExtraErrorFields = {}) {
    super({ code: "SESSION_NOT_FOUND", message, httpStatus: 404, ...opts });
  }
}
export class SessionArchivedError extends SessionError {
  constructor(message = "Session archived", opts: ExtraErrorFields = {}) {
    super({ code: "SESSION_ARCHIVED", message, httpStatus: 409, ...opts });
  }
}

// --- Validation ---
export class ValidationError extends AppError {
  constructor(message = "Validation failed", opts: ExtraErrorFields = {}) {
    super({ code: "VALIDATION_ERROR", message, httpStatus: 400, ...opts });
  }
}

// --- Redis ---
export class RedisStreamError extends AppError {
  constructor(message: string, opts: ExtraErrorFields = {}) {
    super({ code: "REDIS_STREAM_ERROR", message, httpStatus: 503, retryable: true, ...opts });
  }
}

// --- Chat ---
export class ChatError extends AppError {}
export class ChatCorruptedError extends ChatError {
  constructor(chatId: string, details?: string) {
    super({
      code: "CHAT_CORRUPTED",
      message: `Chat ${chatId} has corrupted message history. ${details || "Please fork this chat to continue."}`,
      httpStatus: 422,
      retryable: false,
    });
  }
}
