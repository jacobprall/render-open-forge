"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";

interface Mirror {
  id: string;
  localRepoPath: string;
  remoteRepoUrl: string;
  direction: "pull" | "push" | "bidirectional";
  status: "active" | "paused" | "error";
  lastSyncAt: string | null;
  createdAt: string;
}

const directionLabels: Record<string, { label: string; color: string }> = {
  pull: { label: "Pull", color: "text-blue-400" },
  push: { label: "Push", color: "text-amber-400" },
  bidirectional: { label: "Bidirectional", color: "text-accent-text" },
};

const statusIndicators: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-accent", label: "Active" },
  paused: { dot: "bg-zinc-500", label: "Paused" },
  error: { dot: "bg-danger", label: "Error" },
};

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function extractProvider(url: string): string {
  if (url.includes("github.com")) return "GitHub";
  if (url.includes("gitlab.com") || url.includes("gitlab")) return "GitLab";
  if (url.includes("bitbucket")) return "Bitbucket";
  return "Git";
}

async function mirrorsFetcher(url: string): Promise<Mirror[]> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to load mirrors");
  return json.mirrors ?? [];
}

export default function MirrorsPage() {
  const {
    data: mirrors = [],
    isLoading: loading,
    error: swrError,
    mutate,
  } = useSWR<Mirror[]>("/api/mirrors", mirrorsFetcher, { revalidateOnFocus: true });
  const fetchError = swrError instanceof Error ? swrError.message : swrError ? String(swrError) : null;
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const bannerError = error ?? fetchError;

  const handleSync = async (id: string) => {
    setSyncing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/mirrors/${id}/sync`, { method: "POST" });
      if (res.ok) {
        await mutate(
          (prev) =>
            (prev ?? []).map((m) =>
              m.id === id ? { ...m, lastSyncAt: new Date().toISOString(), status: "active" as const } : m,
            ),
          { revalidate: false },
        );
      } else {
        const json = await res.json();
        setError(json.error ?? "Sync failed");
      }
    } catch {
      setError("Sync request failed");
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/mirrors/${id}`, { method: "DELETE" });
      if (res.ok) {
        await mutate(
          (prev) => (prev ?? []).filter((m) => m.id !== id),
          { revalidate: false },
        );
      } else {
        const json = await res.json();
        setError(json.error ?? "Delete failed");
      }
    } catch {
      setError("Delete request failed");
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleResolve = async (id: string, strategy: string) => {
    try {
      const res = await fetch(`/api/mirrors/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const json = await res.json();
      if (json.resolved) {
        await mutate(
          (prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, status: "active" as const } : m)),
          { revalidate: false },
        );
      }
    } catch {
      setError("Resolve request failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Mirrors</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Repository mirrors syncing between Forgejo and external providers.
          </p>
        </div>
        <Link
          href="/repos/import"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          New Mirror
        </Link>
      </div>

      {bannerError && (
        <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {bannerError}
          {fetchError ? (
            <button
              type="button"
              onClick={() => void mutate()}
              className="ml-2 text-danger underline hover:text-danger"
            >
              Retry
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-danger underline hover:text-danger"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
          <span className="ml-3 text-sm text-zinc-400">Loading mirrors...</span>
        </div>
      )}

      {!loading && mirrors.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-zinc-700"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            />
          </svg>
          <p className="text-sm text-zinc-400">No mirrors configured yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Import repositories from{" "}
            <Link href="/settings/connections" className="text-accent-text hover:underline">
              connected accounts
            </Link>{" "}
            to set up mirrors, or{" "}
            <Link href="/repos/import" className="text-accent-text hover:underline">
              import repos
            </Link>{" "}
            with mirroring enabled.
          </p>
        </div>
      )}

      {!loading && mirrors.length > 0 && (
        <div className="space-y-3">
          {mirrors.map((mirror) => {
            const dir = directionLabels[mirror.direction] ?? directionLabels.push;
            const status = statusIndicators[mirror.status] ?? statusIndicators.active;
            const provider = extractProvider(mirror.remoteRepoUrl);
            const isSyncing = syncing.has(mirror.id);
            const isDeleting = deleting.has(mirror.id);

            return (
              <div
                key={mirror.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <Link
                        href={`/${mirror.localRepoPath}`}
                        className="truncate text-sm font-semibold text-zinc-100 hover:text-accent-text"
                      >
                        {mirror.localRepoPath}
                      </Link>
                      <span className={`text-xs font-medium ${dir.color}`}>
                        {dir.label}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        <span className="text-xs text-zinc-500">{status.label}</span>
                      </div>
                    </div>

                    <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-400">{provider}</span>
                      <span className="truncate" title={mirror.remoteRepoUrl}>
                        {mirror.remoteRepoUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-600">
                      <span>Last sync: {formatRelative(mirror.lastSyncAt)}</span>
                      <span>Created: {formatRelative(mirror.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {mirror.status === "error" && (
                      <button
                        onClick={() => handleResolve(mirror.id, "force-push")}
                        className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 transition hover:border-amber-500/60 hover:text-amber-300"
                      >
                        Force Sync
                      </button>
                    )}

                    <button
                      onClick={() => handleSync(mirror.id)}
                      disabled={isSyncing}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-50"
                    >
                      {isSyncing ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-zinc-200" />
                          Syncing
                        </span>
                      ) : (
                        "Sync Now"
                      )}
                    </button>

                    <button
                      onClick={() => handleDelete(mirror.id)}
                      disabled={isDeleting}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
                    >
                      {isDeleting ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
