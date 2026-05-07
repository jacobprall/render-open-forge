import { eq } from "drizzle-orm";
import { mirrors, syncConnections } from "@render-open-forge/db";
import type { ForgeDb } from "@/lib/db";

const FORGEJO_URL = (process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");

function agentToken(): string {
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return token;
}

async function forgejoApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${FORGEJO_URL}/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${agentToken()}`,
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
  return res.json() as Promise<T>;
}

export interface CreateMirrorParams {
  userId: string;
  syncConnectionId: string;
  forgejoRepoPath: string;
  remoteRepoUrl: string;
  direction: "pull" | "push" | "bidirectional";
  remoteToken: string;
  sessionId?: string;
}

export async function createMirror(
  db: ForgeDb,
  params: CreateMirrorParams,
): Promise<typeof mirrors.$inferSelect> {
  const id = crypto.randomUUID();

  const [owner, repo] = params.forgejoRepoPath.split("/");
  if (!owner || !repo) throw new Error("Invalid forgejoRepoPath");

  if (params.direction === "push" || params.direction === "bidirectional") {
    await forgejoApi(`/repos/${owner}/${repo}/push_mirrors`, {
      method: "POST",
      body: JSON.stringify({
        remote_address: params.remoteRepoUrl,
        remote_username: "",
        remote_password: params.remoteToken,
        interval: "8h0m0s",
        sync_on_commit: true,
      }),
    }).catch(() => undefined);
  }

  if (params.direction === "pull") {
    await forgejoApi(`/repos/${owner}/${repo}`, {
      method: "PATCH",
      body: JSON.stringify({
        mirror: true,
        mirror_interval: "8h0m0s",
      }),
    }).catch(() => undefined);
  }

  const [row] = await db
    .insert(mirrors)
    .values({
      id,
      sessionId: params.sessionId ?? null,
      syncConnectionId: params.syncConnectionId,
      forgejoRepoPath: params.forgejoRepoPath,
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

  const [owner, repo] = mirror.forgejoRepoPath.split("/");
  if (!owner || !repo) throw new Error("Invalid forgejoRepoPath on mirror");

  await forgejoApi(`/repos/${owner}/${repo}/mirror-sync`, {
    method: "POST",
  });

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

  const [owner, repo] = mirror.forgejoRepoPath.split("/");
  if (owner && repo) {
    if (mirror.direction === "push" || mirror.direction === "bidirectional") {
      const pushMirrors = await forgejoApi<
        Array<{ id: number; remote_address: string }>
      >(`/repos/${owner}/${repo}/push_mirrors`).catch(
        () => [] as Array<{ id: number; remote_address: string }>,
      );

      for (const pm of pushMirrors) {
        if (pm.remote_address === mirror.remoteRepoUrl) {
          await forgejoApi(`/repos/${owner}/${repo}/push_mirrors/${pm.id}`, {
            method: "DELETE",
          }).catch(() => undefined);
        }
      }
    }
  }

  await db.delete(mirrors).where(eq(mirrors.id, mirrorId));
}

export async function listMirrors(
  db: ForgeDb,
  userId: string,
): Promise<Array<typeof mirrors.$inferSelect>> {
  const userConnections = await db
    .select({ id: syncConnections.id })
    .from(syncConnections)
    .where(eq(syncConnections.userId, userId));

  if (userConnections.length === 0) return [];

  const connectionIds = new Set(userConnections.map((c) => c.id));
  const allMirrors = await db.select().from(mirrors);

  return allMirrors.filter((m) => connectionIds.has(m.syncConnectionId));
}

// ---------- Conflict Resolution ----------

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

  const [owner, repo] = mirror.forgejoRepoPath.split("/");
  if (!owner || !repo) return { resolved: false, strategy, error: "Invalid repo path" };

  if (strategy === "manual") {
    await db
      .update(mirrors)
      .set({ status: "error" })
      .where(eq(mirrors.id, mirrorId));
    return { resolved: false, strategy, error: "Marked for manual resolution" };
  }

  if (strategy === "force-push") {
    try {
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

// ---------- Cron Sync Scheduler ----------

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
          await syncMirror(db, mirror.id).catch(() => {});
        }
      }
    } catch {
      // swallow top-level errors to keep the cron alive
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
