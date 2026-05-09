"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { Archive } from "lucide-react";
import { archiveSessionAction } from "./actions";
import { StatusBadge } from "@/components/primitives";
import type { Session } from "@openforge/db/schema";

const prStatusStyles: Record<string, { bg: string; icon: string; label: string }> = {
  open: { bg: "bg-success/10 text-success border-success/25", icon: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z", label: "Open" },
  merged: { bg: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218Z", label: "Merged" },
  closed: { bg: "bg-danger/10 text-danger border-danger/25", icon: "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z", label: "Closed" },
};

function PrBadge({ prNumber, prStatus, repoPath }: { prNumber: number; prStatus: string | null; repoPath: string }) {
  const style = prStatusStyles[prStatus ?? "open"] ?? prStatusStyles.open;
  return (
    <Link
      href={`/${repoPath}/pulls/${prNumber}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition hover:brightness-125 ${style.bg}`}
    >
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
        <path d={style.icon} />
      </svg>
      PR #{prNumber}
    </Link>
  );
}

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
      className="block rounded-lg border border-stroke-default p-4 transition hover:border-zinc-600 hover:bg-surface-1"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-zinc-100">{session.title}</h3>
            <StatusBadge status={session.status} dot={false} />
            {session.prNumber != null && (
              <PrBadge
                prNumber={session.prNumber}
                prStatus={session.prStatus}
                repoPath={session.repoPath}
              />
            )}
            {skillChips(session)}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-zinc-500">
            {session.repoPath}
            <span className="text-zinc-600"> · </span>
            {session.branch}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-end gap-1 text-xs text-zinc-500">
            <span suppressHydrationWarning>
              {session.status === "running" ? "Active" : "Last activity"}{" "}
              {formatRelativeTime(session.lastActivityAt ?? session.createdAt)}
            </span>
            {(session.linesAdded || session.linesRemoved) ? (
              <span className="font-mono">
                <span className="text-success">+{session.linesAdded ?? 0}</span>
                {" "}
                <span className="text-danger">-{session.linesRemoved ?? 0}</span>
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
                    className="rounded px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
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
                  className="rounded p-1 text-zinc-700 transition hover:bg-zinc-700/50 hover:text-zinc-400"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded border border-danger/20 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      )}
    </Link>
  );
}
