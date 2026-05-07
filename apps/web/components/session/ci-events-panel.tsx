"use client";

import { useState } from "react";
import { Badge } from "@/components/primitives/badge";
import type { CiEvent } from "@render-open-forge/db/schema";

interface Props {
  events: CiEvent[];
}

const statusVariant: Record<string, "success" | "failure" | "pending" | "neutral"> = {
  success: "success",
  failure: "failure",
  pending: "pending",
  running: "pending",
  error: "failure",
};

export function CiEventsPanel({ events }: Props) {
  const [open, setOpen] = useState(false);

  if (!events.length) return null;

  const latest = events[0];
  const variant = statusVariant[latest.status as string] ?? "neutral";

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/50"
        onClick={() => setOpen(!open)}
      >
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <Badge variant={variant} dot>
          {latest.status}
        </Badge>
        <span className="text-sm font-medium text-zinc-100">
          Actions — {events.length} run{events.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="divide-y divide-zinc-800 border-t border-zinc-800">
          {events.map((ev) => {
            const evVariant = statusVariant[ev.status as string] ?? "neutral";
            return (
              <div key={ev.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={evVariant} dot>
                    {ev.status}
                  </Badge>
                  <span className="text-sm font-medium text-zinc-200">
                    {ev.workflowName ?? "Forgejo Action"}
                  </span>
                  {ev.runId && (
                    <span className="ml-auto font-mono text-xs text-zinc-500">
                      #{ev.runId}
                    </span>
                  )}
                </div>
                {ev.logsUrl && (
                  <a
                    href={ev.logsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-6 inline-block text-xs text-emerald-400 underline underline-offset-2 transition hover:text-emerald-300"
                  >
                    View logs
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
