import { NextResponse } from "next/server";

type CheckStatus = "ok" | "error";

interface HealthCheck {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

async function checkPostgres(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    await db.execute(/* sql */ `SELECT 1`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const url = process.env.REDIS_URL;
    if (!url) return { status: "error", error: "REDIS_URL not configured" };
    // Simple TCP check — attempt connection
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(url, { connectTimeout: 3000, lazyConnect: true });
    await redis.ping();
    await redis.quit();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkForgejo(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const baseUrl = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/v1/version`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET() {
  const [postgres, redis, forgejo] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkForgejo(),
  ]);

  const checks = { postgres, redis, forgejo };
  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const anyOk = Object.values(checks).some((c) => c.status === "ok");

  const status = allOk ? "healthy" : anyOk ? "degraded" : "unhealthy";

  return NextResponse.json(
    { status, checks, ts: Date.now(), env: process.env.NODE_ENV ?? "development" },
    { status: status === "unhealthy" ? 503 : 200 },
  );
}
