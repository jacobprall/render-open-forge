/**
 * SSE connection pool — tracks and limits concurrent SSE connections.
 *
 * Prevents resource exhaustion from too many open SSE streams per server.
 */

const MAX_CONNECTIONS = parseInt(process.env.SSE_MAX_CONNECTIONS ?? "500", 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.SSE_IDLE_TIMEOUT_MS ?? "300000", 10);

interface ConnectionEntry {
  userId: string;
  sessionId: string;
  runId: string;
  startedAt: number;
  lastActivity: number;
}

const connections = new Map<string, ConnectionEntry>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function connectionId(userId: string, sessionId: string, runId: string): string {
  return `${userId}:${sessionId}:${runId}`;
}

export function canAcceptConnection(): boolean {
  return connections.size < MAX_CONNECTIONS;
}

export function currentConnectionCount(): number {
  return connections.size;
}

export function maxConnections(): number {
  return MAX_CONNECTIONS;
}

export function registerConnection(userId: string, sessionId: string, runId: string): string {
  const id = connectionId(userId, sessionId, runId);
  connections.set(id, {
    userId,
    sessionId,
    runId,
    startedAt: Date.now(),
    lastActivity: Date.now(),
  });
  ensureCleanup();
  return id;
}

export function unregisterConnection(id: string): void {
  connections.delete(id);
}

export function touchConnection(id: string): void {
  const entry = connections.get(id);
  if (entry) entry.lastActivity = Date.now();
}

export function getConnectionStats(): {
  total: number;
  max: number;
  byUser: Record<string, number>;
  oldestMs: number;
} {
  const byUser: Record<string, number> = {};
  let oldestMs = 0;
  const now = Date.now();

  for (const entry of connections.values()) {
    byUser[entry.userId] = (byUser[entry.userId] ?? 0) + 1;
    const age = now - entry.startedAt;
    if (age > oldestMs) oldestMs = age;
  }

  return { total: connections.size, max: MAX_CONNECTIONS, byUser, oldestMs };
}

function ensureCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of connections) {
      if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
        connections.delete(id);
      }
    }
    if (connections.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }, 60_000);
}
