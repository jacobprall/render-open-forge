import { eq, and, desc, inArray } from "drizzle-orm";
import { mirrors, syncConnections } from "@openforge/db";
import type { ForgeDb } from "@/lib/db";
import { getAgentForgeProvider } from "@/lib/forgejo/client";
import { logger } from "@openforge/shared";

// ─── Token helpers ──────────────────────────────────────────────────────────

import { getValidGitHubToken } from "./github";
import { getValidGitLabToken } from "./gitlab";

/**
 * Resolve a valid access token for a sync connection, refreshing if needed.
 * Returns null if the connection doesn't exist or refresh fails.
 */
export async function getConnectionToken(
  db: ForgeDb,
  connectionId: string,
): Promise<string | null> {
  const [conn] = await db
    .select()
    .from(syncConnections)
    .where(eq(syncConnections.id, connectionId))
    .limit(1);

  if (!conn) return null;

  switch (conn.provider) {
    case "github":
      return getValidGitHubToken(db, connectionId);
    case "gitlab":
      return getValidGitLabToken(db, connectionId);
    default:
      return conn.accessToken;
  }
}

// ─── Ownership verification ─────────────────────────────────────────────────

/**
 * Verify that a mirror belongs to the given user (through sync_connections).
 * Returns the mirror row if authorized, null otherwise.
 */
export async function getMirrorIfOwned(
  db: ForgeDb,
  mirrorId: string,
  userId: string,
): Promise<typeof mirrors.$inferSelect | null> {
  const [mirror] = await db
    .select()
    .from(mirrors)
    .where(eq(mirrors.id, mirrorId))
    .limit(1);

  if (!mirror) return null;

  const [conn] = await db
    .select()
    .from(syncConnections)
    .where(
      and(
        eq(syncConnections.id, mirror.syncConnectionId),
        eq(syncConnections.userId, userId),
      ),
    )
    .limit(1);

  return conn ? mirror : null;
}

// ─── Forgejo API helpers ────────────────────────────────────────────────────

interface PushMirrorEntry {
  id: number;
  remote_address: string;
}

function splitRepoPath(repoPath: string): [string, string] {
  const [owner, repo] = repoPath.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo path: ${repoPath}`);
  return [owner, repo];
}

function getForgejoBaseUrl(): string {
  return (process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getAgentToken(): string {
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return token;
}

async function forgejoApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getForgejoBaseUrl()}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${getAgentToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Forgejo API ${res.status}: ${res.statusText} - ${body}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text || !text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

// ─── Push mirror setup ──────────────────────────────────────────────────────

async function configurePushMirror(
  owner: string,
  repo: string,
  remoteUrl: string,
  remoteToken: string,
): Promise<void> {
  await forgejoApi(`/repos/${owner}/${repo}/push_mirrors`, {
    method: "POST",
    body: JSON.stringify({
      remote_address: remoteUrl,
      remote_username: "",
      remote_password: remoteToken,
      interval: "8h0m0s",
      sync_on_commit: true,
    }),
  });
}

// ─── Pull mirror setup ─────────────────────────────────────────────────────

async function configurePullMirror(
  owner: string,
  repo: string,
  remoteUrl: string,
  remoteToken: string,
): Promise<void> {
  const forge = getAgentForgeProvider();
  await forge.repos.migrate({
    cloneAddr: remoteUrl,
    repoName: repo,
    repoOwner: owner,
    mirror: true,
    authToken: remoteToken,
  }).catch(() => {
    // If the repo already exists, fall back to updating mirror settings.
    // Forgejo's PATCH with mirror + interval only works on repos that were
    // originally created as mirrors, so this is best-effort.
    return forgejoApi(`/repos/${owner}/${repo}`, {
      method: "PATCH",
      body: JSON.stringify({
        mirror: true,
        mirror_interval: "8h0m0s",
      }),
    });
  });
}

// ─── Remove push mirrors ───────────────────────────────────────────────────

async function removePushMirrorsForUrl(
  owner: string,
  repo: string,
  remoteUrl: string,
): Promise<void> {
  const pushMirrors = await forgejoApi<PushMirrorEntry[]>(
    `/repos/${owner}/${repo}/push_mirrors`,
  ).catch(() => [] as PushMirrorEntry[]);

  for (const pm of pushMirrors) {
    if (pm.remote_address === remoteUrl) {
      await forgejoApi(`/repos/${owner}/${repo}/push_mirrors/${pm.id}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export interface CreateMirrorParams {
  userId: string;
  syncConnectionId: string;
  localRepoPath: string;
  remoteRepoUrl: string;
  direction: "pull" | "push" | "bidirectional";
  /** If omitted, auto-resolved from the sync connection. */
  remoteToken?: string;
  sessionId?: string;
}

export async function createMirror(
  db: ForgeDb,
  params: CreateMirrorParams,
): Promise<typeof mirrors.$inferSelect> {
  const id = crypto.randomUUID();
  const [owner, repo] = splitRepoPath(params.localRepoPath);

  const token =
    params.remoteToken ?? (await getConnectionToken(db, params.syncConnectionId));
  if (!token) {
    throw new Error("Unable to resolve remote token for sync connection");
  }

  if (params.direction === "push" || params.direction === "bidirectional") {
    await configurePushMirror(owner, repo, params.remoteRepoUrl, token).catch((err) => {
      logger.errorWithCause(err, "push mirror setup failed", {
        repo: params.localRepoPath,
      });
    });
  }

  if (params.direction === "pull" || params.direction === "bidirectional") {
    await configurePullMirror(owner, repo, params.remoteRepoUrl, token).catch((err) => {
      logger.errorWithCause(err, "pull mirror setup failed", {
        repo: params.localRepoPath,
      });
    });
  }

  const [row] = await db
    .insert(mirrors)
    .values({
      id,
      sessionId: params.sessionId ?? null,
      syncConnectionId: params.syncConnectionId,
      localRepoPath: params.localRepoPath,
      remoteRepoUrl: params.remoteRepoUrl,
      direction: params.direction,
      status: "active",
    })
    .returning();

  return row;
}

export async function syncMirror(db: ForgeDb, mirrorId: string): Promise<void> {
  const [mirror] = await db
    .select()
    .from(mirrors)
    .where(eq(mirrors.id, mirrorId))
    .limit(1);

  if (!mirror) throw new Error("Mirror not found");

  const [owner, repo] = splitRepoPath(mirror.localRepoPath);

  await forgejoApi(`/repos/${owner}/${repo}/mirror-sync`, { method: "POST" });

  await db
    .update(mirrors)
    .set({ lastSyncAt: new Date() })
    .where(eq(mirrors.id, mirrorId));
}

export async function deleteMirror(db: ForgeDb, mirrorId: string): Promise<void> {
  const [mirror] = await db
    .select()
    .from(mirrors)
    .where(eq(mirrors.id, mirrorId))
    .limit(1);

  if (!mirror) return;

  const [owner, repo] = splitRepoPath(mirror.localRepoPath);

  if (mirror.direction === "push" || mirror.direction === "bidirectional") {
    await removePushMirrorsForUrl(owner, repo, mirror.remoteRepoUrl);
  }

  await db.delete(mirrors).where(eq(mirrors.id, mirrorId));
}

export async function listMirrors(
  db: ForgeDb,
  userId: string,
  pagination?: { limit: number; offset: number },
): Promise<Array<typeof mirrors.$inferSelect>> {
  const userConnections = await db
    .select({ id: syncConnections.id })
    .from(syncConnections)
    .where(eq(syncConnections.userId, userId));

  if (userConnections.length === 0) return [];

  const q = db
    .select()
    .from(mirrors)
    .where(
      inArray(
        mirrors.syncConnectionId,
        userConnections.map((c) => c.id),
      ),
    )
    .orderBy(desc(mirrors.createdAt));

  if (pagination) {
    return q.limit(pagination.limit + 1).offset(pagination.offset);
  }

  return q;
}

/**
 * Look up a mirror by its remote URL and optional provider filter.
 */
export async function findMirrorByRemoteUrl(
  db: ForgeDb,
  remoteUrl: string,
): Promise<typeof mirrors.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(mirrors)
    .where(eq(mirrors.remoteRepoUrl, remoteUrl))
    .limit(1);
  return row ?? null;
}

// ─── Conflict Resolution ────────────────────────────────────────────────────

export type ConflictStrategy = "force-push" | "manual" | "rebase";

export interface ConflictResolutionResult {
  resolved: boolean;
  strategy: ConflictStrategy;
  error?: string;
}

/**
 * Attempt to resolve a mirror sync conflict using the specified strategy.
 * - force-push: force-pushes the source to the destination (destructive)
 * - rebase: triggers a mirror-sync which fast-forwards when possible
 * - manual: marks the mirror as conflicted for human intervention
 */
export async function resolveMirrorConflict(
  db: ForgeDb,
  mirrorId: string,
  strategy: ConflictStrategy = "manual",
): Promise<ConflictResolutionResult> {
  const [mirror] = await db
    .select()
    .from(mirrors)
    .where(eq(mirrors.id, mirrorId))
    .limit(1);

  if (!mirror) return { resolved: false, strategy, error: "Mirror not found" };

  const [owner, repo] = splitRepoPath(mirror.localRepoPath);

  if (strategy === "manual") {
    await db
      .update(mirrors)
      .set({ status: "error" })
      .where(eq(mirrors.id, mirrorId));
    return { resolved: false, strategy, error: "Marked for manual resolution" };
  }

  if (strategy === "force-push") {
    try {
      // For push mirrors, Forgejo mirror-sync will push local state to remote.
      // For pull mirrors, it pulls the latest. Both "force" the canonical direction.
      await forgejoApi(`/repos/${owner}/${repo}/mirror-sync`, { method: "POST" });
      await db
        .update(mirrors)
        .set({ status: "active", lastSyncAt: new Date() })
        .where(eq(mirrors.id, mirrorId));
      return { resolved: true, strategy };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await db
        .update(mirrors)
        .set({ status: "error" })
        .where(eq(mirrors.id, mirrorId));
      return { resolved: false, strategy, error: msg };
    }
  }

  // rebase: attempt normal sync (Forgejo handles fast-forward)
  try {
    await forgejoApi(`/repos/${owner}/${repo}/mirror-sync`, { method: "POST" });
    await db
      .update(mirrors)
      .set({ status: "active", lastSyncAt: new Date() })
      .where(eq(mirrors.id, mirrorId));
    return { resolved: true, strategy };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { resolved: false, strategy, error: msg };
  }
}

// ─── Cron Sync Scheduler ────────────────────────────────────────────────────

let cronInterval: ReturnType<typeof setInterval> | null = null;

const DEFAULT_SYNC_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Start the periodic sync scheduler. Iterates all active mirrors and
 * triggers a sync if lastSyncAt is older than the configured interval.
 */
export function startMirrorCron(
  db: ForgeDb,
  intervalMs: number = DEFAULT_SYNC_INTERVAL_MS,
): void {
  if (cronInterval) return;

  async function tick() {
    try {
      const activeMirrors = await db
        .select()
        .from(mirrors)
        .where(eq(mirrors.status, "active"));

      const now = Date.now();
      for (const mirror of activeMirrors) {
        const lastSync = mirror.lastSyncAt ? new Date(mirror.lastSyncAt).getTime() : 0;
        if (now - lastSync >= intervalMs) {
          await syncMirror(db, mirror.id).catch((err) => {
            logger.errorWithCause(err, "mirror cron sync failed", {
              mirrorId: mirror.id,
            });
          });
        }
      }
    } catch (err) {
      logger.errorWithCause(
        err instanceof Error ? err : new Error(String(err)),
        "mirror cron tick error",
        {},
      );
    }
  }

  tick();
  cronInterval = setInterval(tick, Math.min(intervalMs, 60 * 60 * 1000));
}

export function stopMirrorCron(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
  }
}
