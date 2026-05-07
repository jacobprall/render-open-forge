"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { archiveSessionAction } from "./actions";
import type { Session } from "@render-open-forge/db/schema";

const statusColors: Record<string, string> = {
  running: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  archived: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

function skillChips(session: Session) {
  const skills = session.activeSkills ?? [];
  if (skills.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {skills.slice(0, 5).map((s) => (
        <span
          key={`${s.source}-${s.slug}`}
          className="font-mono text-[10px] text-zinc-500"
        >
          {s.slug}
        </span>
      ))}
      {skills.length > 5 ? <span className="text-[10px] text-zinc-600">+{skills.length - 5}</span> : null}
    </span>
  );
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SessionCard({ session }: { session: Session }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const canArchive = session.status !== "running" && session.status !== "archived";

  function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  }

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
    startTransition(async () => {
      const result = await archiveSessionAction(session.id);
      if (result.error) {
        setError(result.error);
        setTimeout(() => setError(null), 3000);
      }
    });
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
  }

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="block rounded-lg border border-zinc-800 p-4 transition hover:border-zinc-600 hover:bg-zinc-900/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-zinc-100">{session.title}</h3>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[session.status]}`}
            >
              {session.status}
            </span>
            {skillChips(session)}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-zinc-500">
            {session.forgejoRepoPath}
            <span className="text-zinc-600"> · </span>
            {session.branch}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-end gap-1 text-xs text-zinc-500">
            <span suppressHydrationWarning>{formatRelativeTime(session.lastActivityAt ?? session.createdAt)}</span>
            {(session.linesAdded || session.linesRemoved) ? (
              <span className="font-mono">
                <span className="text-emerald-400">+{session.linesAdded ?? 0}</span>
                {" "}
                <span className="text-red-400">-{session.linesRemoved ?? 0}</span>
              </span>
            ) : null}
          </div>
          {canArchive && (
            <div className="relative">
              {showConfirm ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleConfirm}
                    disabled={isPending}
                    className="rounded px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {isPending ? "Archiving…" : "Confirm"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isPending}
                    className="rounded px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700/50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleArchive}
                  title="Archive session"
                  className="rounded p-1 text-zinc-500 transition hover:bg-zinc-700/50 hover:text-zinc-300"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}
    </Link>
  );
}
