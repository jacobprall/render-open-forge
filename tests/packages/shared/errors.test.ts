import { describe, expect, test } from "bun:test";
import {
  AppError,
  NotAuthenticatedError,
  RedisStreamError,
  SandboxProviderNotFoundError,
} from "../../../packages/shared";

describe("AppError hierarchy", () => {
  test("serializes to JSON envelope with details", () => {
    const err = new AppError({
      code: "TEST",
      message: "hello",
      httpStatus: 418,
      retryable: true,
      details: { foo: 1 },
    });
    expect(err.toJSON()).toEqual({
      error: {
        code: "TEST",
        message: "hello",
        retryable: true,
        details: { foo: 1 },
      },
    });
  });

  test("subclasses set stable codes", () => {
    expect(new NotAuthenticatedError().code).toBe("NOT_AUTHENTICATED");
    expect(new RedisStreamError("x").code).toBe("REDIS_STREAM_ERROR");
    expect(new RedisStreamError("x").retryable).toBe(true);
    expect(new SandboxProviderNotFoundError("x").code).toBe("SANDBOX_PROVIDER_NOT_FOUND");
  });
});
