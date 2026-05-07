import type Redis from "ioredis";

export function abortableBlpop(
  redis: Redis,
  key: string,
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<[string, string] | null> {
  if (!signal) {
    return redis.blpop(key, timeoutSec);
  }

  if (signal.aborted) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    const onAbort = () => {
      cleanup();
      void redis.quit().catch(() => {});
      resolve(null);
    };

    signal.addEventListener("abort", onAbort);

    redis
      .blpop(key, timeoutSec)
      .then((r) => {
        cleanup();
        resolve(r);
      })
      .catch((e) => {
        cleanup();
        reject(e);
      });
  });
}
