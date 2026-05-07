import type { AppError } from "./errors";

export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  sessionId?: string;
  service?: "web" | "worker" | "sandbox";
  [key: string]: unknown;
}

function line(level: LogLevel, message: string, context?: LogContext): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(payload));
}

export const logger = {
  info(message: string, context?: LogContext): void {
    line("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    line("warn", message, context);
  },
  error(message: string, context?: LogContext): void {
    line("error", message, context);
  },
  errorWithCause(err: unknown, message: string, context?: LogContext): void {
    const base: LogContext = { ...context };
    if (err instanceof Error) {
      base.errName = err.name;
      base.errMessage = err.message;
      if ("cause" in err && err.cause) base.cause = err.cause;
    }
    if (typeof err === "object" && err !== null && "code" in err) {
      const ae = err as AppError;
      base.code = ae.code;
      base.httpStatus = ae.httpStatus;
    }
    line("error", message, base);
  },
};
