import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getSharedRedisClient, isRedisConfigured } = await import("@/lib/redis");
    if (!isRedisConfigured()) {
      return NextResponse.json({ hasActiveWorkers: false, error: "Redis not configured" });
    }

    const redis = getSharedRedisClient();
    const workerKeys = await redis.keys("worker:heartbeat:*");
    let activeCount = 0;
    for (const key of workerKeys) {
      const raw = await redis.get(key);
      if (raw) activeCount++;
    }

    return NextResponse.json({ hasActiveWorkers: activeCount > 0, activeWorkers: activeCount });
  } catch (err) {
    return NextResponse.json(
      { hasActiveWorkers: false, error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
