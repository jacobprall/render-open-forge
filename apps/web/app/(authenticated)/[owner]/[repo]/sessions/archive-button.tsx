"use client";

import { useTransition, useState } from "react";
import { archiveSessionAction } from "@/app/(authenticated)/sessions/actions";

export function ArchiveButton({ sessionId }: { sessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  if (showConfirm) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            setShowConfirm(false);
            startTransition(async () => {
              await archiveSessionAction(sessionId);
            });
          }}
          disabled={isPending}
          className="rounded px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          {isPending ? "Archiving\u2026" : "Confirm"}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700/50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      title="Archive session"
      className="rounded p-1 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-700/50 hover:text-zinc-300"
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
  );
}
