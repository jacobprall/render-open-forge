export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter. Safe for Edge Runtime (middleware).
 * For distributed Redis-backed limiting in route handlers, use {@link checkRateLimitAsync}.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  return checkInMemoryRateLimit(key, maxRequests, windowMs);
}

/**
 * Async version that uses Redis INCR + PEXPIRE for distributed rate limiting.
 * Use this in async contexts (route handlers) for accurate multi-instance limiting.
 * Dynamically imports ioredis to avoid polluting the Edge Runtime bundle.
 */
export async function checkRateLimitAsync(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const { isRedisConfigured, getSharedRedisClient } = await import("@/lib/redis");

  if (!isRedisConfigured()) {
    return checkInMemoryRateLimit(key, maxRequests, windowMs);
  }

  const redis = getSharedRedisClient();
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / windowMs)}`;
  const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;

  try {
    const count = await redis.incr(windowKey);
    if (count === 1) {
      await redis.pexpire(windowKey, windowMs);
    }

    if (count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: maxRequests - count,
      resetAt,
    };
  } catch {
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }
}

// ---------------------------------------------------------------------------
// Synchronous fallback (for Next.js middleware which must be sync)
// Uses an in-memory Map. Not distributed but better than nothing.
// ---------------------------------------------------------------------------

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

let cleanupIntervalStarted = false;

export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

if (typeof setInterval === "function" && !cleanupIntervalStarted) {
  cleanupIntervalStarted = true;
  setInterval(cleanupExpiredEntries, 60_000);
}

function checkInMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

export function getRateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
