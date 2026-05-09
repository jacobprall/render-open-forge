"use client";

import { useState } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import type { SessionCardSession } from "./session-card";
import { SessionCard } from "./session-card";

export function SessionsDrawer({ sessions }: { sessions: SessionCardSession[] }) {
  const [open, setOpen] = useState(false);

  if (sessions.length === 0) return null;

  return (
    <>
      {/* Toggle button -- fixed in top-right of the content area */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="absolute right-4 top-4 z-10 flex items-center gap-1.5 border border-stroke-subtle bg-surface-1 px-2.5 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-(--of-duration-instant) hover:bg-surface-2 hover:text-text-primary"
        title={open ? "Close sessions" : "Recent sessions"}
      >
        {open ? (
          <PanelRightClose className="h-3.5 w-3.5" />
        ) : (
          <>
            <PanelRightOpen className="h-3.5 w-3.5" />
            <span className="tabular-nums">{sessions.length}</span>
          </>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="shrink-0 h-full w-80 border-l border-stroke-subtle bg-surface-0 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-stroke-subtle px-(--of-space-md) py-(--of-space-sm)">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Recent sessions
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
