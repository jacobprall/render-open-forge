"use client";

import { useState, useTransition } from "react";
import { apiFetch } from "@/lib/api-fetch";

export function ReviewButton({ sessionId }: { sessionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const { ok, data } = await apiFetch<{ error?: string }>(`/api/sessions/${sessionId}/review`, {
          method: "POST",
        });
        if (!ok) {
          setError(typeof data.error === "string" ? data.error : "Failed");
          return;
        }
        setDone(true);
      } catch {
        setError("Network error");
      }
    });
  }

  if (done) {
    return (
      <span className="text-xs text-accent-text font-medium px-2 py-1">
        Review started
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-primary transition-colors duration-(--of-duration-instant) hover:bg-surface-3 disabled:opacity-50"
      >
        {isPending ? "Starting..." : "Agent Review"}
      </button>
      {error && (
        <div className="absolute right-0 bottom-full mb-1 z-10 whitespace-nowrap rounded border border-danger/20 bg-surface-1 px-2 py-1 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
