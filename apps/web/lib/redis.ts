import Redis, { type RedisOptions } from "ioredis";

export function getRedisUrl(): string | null {
  return process.env.REDIS_URL?.trim() ?? null;
}

export function isRedisConfigured(): boolean {
  return getRedisUrl() !== null;
}

export function createRedisClient(clientName = "redis-client"): Redis {
  const url = getRedisUrl();
  if (!url) throw new Error("REDIS_URL environment variable is required");

  const opts: RedisOptions = {};

  const parsed = new URL(url.includes("://") ? url : `redis://${url}`);
  if (parsed.username) opts.username = decodeURIComponent(parsed.username);
  if (parsed.password) opts.password = decodeURIComponent(parsed.password);
  if (parsed.hostname) opts.host = parsed.hostname;
  if (parsed.port) opts.port = parseInt(parsed.port, 10);
  const dbPath = parsed.pathname.replace(/^\/+/, "");
  if (dbPath) {
    const n = parseInt(dbPath, 10);
    if (!isNaN(n)) opts.db = n;
  }
  if (parsed.protocol === "rediss:") opts.tls = {};

  const client = new Redis(opts);
  client.on("error", (error) => console.error(`[redis] ${clientName} error:`, error));
  return client;
}
