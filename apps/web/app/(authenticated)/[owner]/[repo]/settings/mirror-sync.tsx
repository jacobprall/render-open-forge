"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

interface MirrorSyncProps {
  mirrorId: string;
  remoteRepoUrl: string;
  direction: string;
  lastSyncAt: string | null;
  status: string;
}

function extractProvider(url: string): string {
  if (url.includes("github.com")) return "GitHub";
  if (url.includes("gitlab.com") || url.includes("gitlab")) return "GitLab";
  if (url.includes("bitbucket")) return "Bitbucket";
  return "Git";
}

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

const directionLabels: Record<string, string> = {
  pull: "Pull",
  push: "Push",
  bidirectional: "Bidirectional",
};

export function MirrorSync({ mirrorId, remoteRepoUrl, direction, lastSyncAt, status }: MirrorSyncProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(lastSyncAt);
  const [error, setError] = useState<string | null>(null);

  const provider = extractProvider(remoteRepoUrl);
  const cleanUrl = remoteRepoUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "");

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const { ok, status, data } = await apiFetch<{ error?: string }>(`/api/mirrors/${mirrorId}/sync`, { method: "POST" });
      if (ok) {
        setLastSync(new Date().toISOString());
      } else {
        setError(typeof data.error === "string" ? data.error : `Sync failed (${status})`);
      }
    } catch {
      setError("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="border border-stroke-subtle bg-surface-1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-text-tertiary">{provider}</span>
            <span className="bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-secondary">
              {directionLabels[direction] ?? direction}
            </span>
            <div className="flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "active" ? "bg-accent" : status === "error" ? "bg-danger" : "bg-surface-3"
                }`}
              />
              <span className="text-xs text-text-tertiary capitalize">{status}</span>
            </div>
          </div>

          <div className="mt-1.5 truncate text-xs text-text-tertiary" title={remoteRepoUrl}>
            {cleanUrl}
          </div>

          <div className="mt-2 text-xs text-text-tertiary">
            Last sync: {formatRelative(lastSync)}
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="shrink-0 border border-stroke-default px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-(--of-duration-instant) hover:border-stroke-subtle hover:text-text-primary disabled:opacity-50"
        >
          {syncing ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border border-stroke-default border-t-text-primary" />
              Syncing
            </span>
          ) : (
            "Sync Now"
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
