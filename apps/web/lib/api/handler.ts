import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { getSession, type UserSession } from "@/lib/auth/session";
import { ApiError, formatApiError, unauthorized } from "./errors";
import { logger } from "@render-open-forge/shared";

interface HandlerOptions<TBody = unknown> {
  auth?: boolean; // default true — require session
  bodySchema?: ZodSchema<TBody>;
}

type HandlerContext<TBody = unknown> = {
  req: NextRequest;
  session: UserSession | null;
  body: TBody;
  params: Record<string, string>;
  requestId: string;
};

export function withApiHandler<TBody = unknown>(
  options: HandlerOptions<TBody>,
  handler: (ctx: HandlerContext<TBody>) => Promise<NextResponse>,
) {
  return async (
    req: NextRequest,
    routeContext?: { params?: Promise<Record<string, string>> },
  ) => {
    const start = Date.now();
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

    try {
      // Auth
      const session = await getSession();
      if (options.auth !== false && !session) {
        throw unauthorized();
      }

      // Params
      const params = routeContext?.params ? await routeContext.params : {};

      // Body parsing + validation
      let body = undefined as TBody;
      if (options.bodySchema) {
        const raw = await req.json().catch(() => null);
        const parsed = options.bodySchema.safeParse(raw);
        if (!parsed.success) {
          throw new ApiError(
            "VALIDATION_ERROR",
            "Invalid input",
            400,
            parsed.error.flatten(),
          );
        }
        body = parsed.data;
      }

      // Execute handler
      const response = await handler({ req, session, body, params, requestId });
      response.headers.set("x-request-id", requestId);

      const duration = Date.now() - start;
      logger.info("api request", {
        method: req.method,
        path: req.nextUrl.pathname,
        status: String(response.status),
        duration: String(duration),
        userId: session?.userId ?? "",
        requestId,
      });

      return response;
    } catch (err) {
      const duration = Date.now() - start;

      if (err instanceof ApiError) {
        logger.info("api request", {
          method: req.method,
          path: req.nextUrl.pathname,
          status: String(err.status),
          duration: String(duration),
          error: err.code,
          requestId,
        });
        return NextResponse.json(formatApiError(err), {
          status: err.status,
          headers: { "x-request-id": requestId },
        });
      }

      logger.errorWithCause(err, "api request failed", {
        method: req.method,
        path: req.nextUrl.pathname,
        requestId,
      });

      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  };
}
