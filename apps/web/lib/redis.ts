import Redis from "ioredis";

/** Dedicated pub/sub subscriber connection name used by `@/lib/sse/shared-subscriber`. */
const SSE_SHARED_SUB_NAME = "sse-shared-sub";

export function getRedisUrl(): string | null {
  return process.env.REDIS_URL?.trim() ?? null;
}

export function isRedisConfigured(): boolean {
  return getRedisUrl() !== null;
}

function normalizeRedisUrl(raw: string): string {
  return raw.includes("://") ? raw : `redis://${raw}`;
}

function newRedisConnection(connectionName: string): Redis {
  const url = getRedisUrl();
  if (!url) throw new Error("REDIS_URL environment variable is required");

  const client = new Redis(normalizeRedisUrl(url), {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectionName,
  });
  client.on("error", (err) => {
    console.error(`[redis] ${connectionName} connection error:`, err.message);
  });
  return client;
}

let _sharedClient: Redis | null = null;
let _sharedRealQuit: (() => Promise<void>) | null = null;

/**
 * Lazily created singleton for Redis commands (GET, SET, streams, etc.).
 * Prefer this over {@link createRedisClient} for new code.
 */
export function getSharedRedisClient(): Redis {
  if (!_sharedClient) {
    const client = newRedisConnection("web-shared");
    const realQuit = client.quit.bind(client);
    _sharedRealQuit = async () => {
      await realQuit().catch(() => {});
    };
    // Callers historically disconnect per-request; never tear down the shared pool from routes.
    client.disconnect = () => {};
    client.quit = () => Promise.resolve("OK");
    _sharedClient = client;
  }
  return _sharedClient;
}

let _pubSubClient: Redis | null = null;

/**
 * Separate connection for SUBSCRIBE (Redis enters subscriber mode; cannot share with normal commands).
 * Only used when {@link createRedisClient} is called with name {@link SSE_SHARED_SUB_NAME}.
 */
function getPubSubRedisClient(): Redis {
  if (!_pubSubClient) {
    _pubSubClient = newRedisConnection("web-pubsub");
  }
  return _pubSubClient;
}

/**
 * @deprecated Use {@link getSharedRedisClient} for command traffic. This returns the shared client for
 * almost all names; the exception is {@link SSE_SHARED_SUB_NAME}, which returns a dedicated pub/sub connection.
 */
export function createRedisClient(clientName = "redis-client"): Redis {
  if (clientName === SSE_SHARED_SUB_NAME) return getPubSubRedisClient();
  return getSharedRedisClient();
}

/** Graceful shutdown for tests or process exit hooks. */
export async function disconnectAll(): Promise<void> {
  if (_pubSubClient) {
    try {
      await _pubSubClient.quit();
    } catch {
      _pubSubClient.disconnect();
    }
    _pubSubClient = null;
  }
  if (_sharedRealQuit) {
    await _sharedRealQuit();
    _sharedRealQuit = null;
  }
  _sharedClient = null;
}
