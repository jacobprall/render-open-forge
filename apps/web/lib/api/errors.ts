export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function formatApiError(err: ApiError): ApiErrorResponse {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  };
}

// Common factory functions
export const unauthorized = (message = "Unauthorized") => new ApiError("UNAUTHORIZED", message, 401);
export const forbidden = (message = "Forbidden") => new ApiError("FORBIDDEN", message, 403);
export const notFound = (message = "Not found") => new ApiError("NOT_FOUND", message, 404);
export const badRequest = (message: string, details?: unknown) => new ApiError("BAD_REQUEST", message, 400, details);
export const serverError = (message = "Internal server error") => new ApiError("INTERNAL_ERROR", message, 500);

/**
 * Duck-typed check for platform AppError instances.
 * `instanceof` can fail across Next.js module boundaries when the shared
 * package is resolved as separate copies, so we also check for the
 * `httpStatus` property that all AppError subclasses carry.
 */
export function isPlatformError(err: unknown): err is { message: string; httpStatus: number; code: string } {
  return err instanceof Error && typeof (err as Record<string, unknown>).httpStatus === "number";
}
