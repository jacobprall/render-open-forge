"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReviewButton } from "./review-button";

interface InboxItem {
  id: string;
  userId: string;
  sessionId: string;
  repoPath: string;
  prNumber: number;
  action: string;
  title: string | null;
  actionNeeded: boolean;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const actionConfig: Record<string, { icon: string; label: string; color: string; description: string }> = {
  opened: {
    icon: "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z",
    label: "PR Opened",
    color: "text-emerald-400",
    description: "Ready for review",
  },
  ci_passed: {
    icon: "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z",
    label: "CI Passed",
    color: "text-emerald-400",
    description: "All checks passing — ready to merge",
  },
  ci_failed: {
    icon: "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z",
    label: "CI Failed",
    color: "text-red-400",
    description: "Checks failing — needs fix",
  },
  commented: {
    icon: "M1.5 2.75a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v9.5a.25.25 0 0 1-.25.25h-4.232a.25.25 0 0 0-.177.073l-2.616 2.616a.25.25 0 0 1-.427-.177V12.5H1.75a.25.25 0 0 1-.25-.25Z",
    label: "New Comment",
    color: "text-blue-400",
    description: "Review feedback received",
  },
  review_requested: {
    icon: "M10.68 12.08a.75.75 0 0 1-.23-1.03l2.5-4a.75.75 0 1 1 1.27.79l-2.5 4a.75.75 0 0 1-1.04.24ZM7.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM11 10.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
    label: "Review Requested",
    color: "text-amber-400",
    description: "Agent review in progress",
  },
  review_submitted: {
    icon: "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z",
    label: "Review Submitted",
    color: "text-purple-400",
    description: "Review complete",
  },
  merged: {
    icon: "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218Z",
    label: "Merged",
    color: "text-purple-400",
    description: "PR merged successfully",
  },
  closed: {
    icon: "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z",
    label: "Closed",
    color: "text-red-400",
    description: "PR closed without merge",
  },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InboxView({ initialItems }: { initialItems: InboxItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleDismiss(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    startTransition(async () => {
      await fetch("/api/inbox/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      router.refresh();
    });
  }

  async function handleDismissAll() {
    const ids = items.map((item) => item.id);
    setItems([]);
    startTransition(async () => {
      await fetch("/api/inbox/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-zinc-300">All caught up</h3>
        <p className="mt-1 text-sm text-zinc-500">
          No pull requests need your attention right now.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-zinc-400">
          {items.length} item{items.length !== 1 ? "s" : ""} needing attention
        </span>
        <button
          onClick={handleDismissAll}
          disabled={isPending}
          className="rounded px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        {items.map((item) => (
          <InboxCard key={item.id} item={item} onDismiss={handleDismiss} />
        ))}
      </div>
    </div>
  );
}

function InboxCard({
  item,
  onDismiss,
}: {
  item: InboxItem;
  onDismiss: (id: string) => void;
}) {
  const config = actionConfig[item.action] ?? {
    icon: "",
    label: item.action,
    color: "text-zinc-400",
    description: "",
  };

  const prUrl = `/${item.repoPath}/pulls/${item.prNumber}`;
  const showReviewButton = item.action === "opened" || item.action === "ci_passed";

  return (
    <div className="flex items-start gap-4 border-b border-zinc-800 px-5 py-4 last:border-b-0 transition hover:bg-zinc-800/30">
      {/* Action icon */}
      <div className={`mt-0.5 shrink-0 ${config.color}`}>
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
          <path d={config.icon} />
        </svg>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-zinc-600">·</span>
          <Link href={`/${item.repoPath}`} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            {item.repoPath}
          </Link>
          <span className="text-xs text-zinc-600">·</span>
          <span className="text-xs text-zinc-500" suppressHydrationWarning>
            {relativeTime(item.createdAt)}
          </span>
        </div>
        <div className="mt-1">
          <Link
            href={prUrl}
            className="text-sm font-medium text-zinc-200 hover:text-emerald-400 transition"
          >
            {item.title ?? `PR #${item.prNumber}`}
          </Link>
          <span className="ml-2 text-xs text-zinc-500">#{item.prNumber}</span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{config.description}</p>

        {item.metadata?.commentBody != null && (
          <div className="mt-2 rounded border border-zinc-700/50 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400">
            {String(item.metadata.commentBody as string).slice(0, 200)}
            {String(item.metadata.commentBody as string).length > 200 ? "..." : ""}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={prUrl}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
        >
          View
        </Link>
        <Link
          href={`/sessions/${item.sessionId}`}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
        >
          Session
        </Link>
        {showReviewButton && (
          <ReviewButton sessionId={item.sessionId} />
        )}
        <button
          onClick={() => onDismiss(item.id)}
          title="Dismiss"
          className="rounded p-1 text-zinc-600 transition hover:bg-zinc-700 hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
