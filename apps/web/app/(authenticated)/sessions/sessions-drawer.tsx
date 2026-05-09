"use client";

import { useState, useMemo } from "react";
import { PanelRightOpen, PanelRightClose, Filter } from "lucide-react";
import type { SessionCardSession } from "./session-card";
import { SessionCard } from "./session-card";

interface SessionsDrawerProps {
  sessions: SessionCardSession[];
  projectNames?: Record<string, string>;
  projectFilter?: string | null;
}

export function SessionsDrawer({ sessions, projectNames, projectFilter }: SessionsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [filterProject, setFilterProject] = useState<string | null>(projectFilter ?? null);

  const projectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.projectId) ids.add(s.projectId);
    }
    return Array.from(ids);
  }, [sessions]);

  const filtered = useMemo(() => {
    if (!filterProject) return sessions;
    return sessions.filter((s) => s.projectId === filterProject);
  }, [sessions, filterProject]);

  if (sessions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="absolute right-4 top-4 z-10 flex min-h-11 min-w-11 items-center justify-center gap-1.5 border border-stroke-subtle bg-surface-1 px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors duration-(--of-duration-instant) hover:bg-surface-2 hover:text-text-primary"
        title={open ? "Close sessions" : "Recent sessions"}
      >
        {open ? (
          <PanelRightClose className="h-4 w-4" />
        ) : (
          <>
            <PanelRightOpen className="h-4 w-4" />
            <span className="tabular-nums">{sessions.length}</span>
          </>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Panel: overlay on mobile, inline on desktop */}
          <div className="fixed inset-y-0 right-0 z-40 flex h-full w-80 max-w-[85vw] flex-col border-l border-stroke-subtle bg-surface-0 md:static md:z-auto md:max-w-none md:shrink-0">
            <div className="shrink-0 border-b border-stroke-subtle px-(--of-space-md) py-(--of-space-sm)">
              <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Recent sessions
                </h2>
                {projectIds.length > 1 && (
                  <div className="relative">
                    <select
                      value={filterProject ?? ""}
                      onChange={(e) => setFilterProject(e.target.value || null)}
                      className="appearance-none border-none bg-transparent pr-5 text-[12px] text-text-tertiary outline-none cursor-pointer hover:text-text-secondary"
                    >
                      <option value="">All projects</option>
                      {projectIds.map((pid) => (
                        <option key={pid} value={pid}>
                          {projectNames?.[pid] ?? pid.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <Filter className="pointer-events-none absolute right-0 top-0.5 h-3 w-3 text-text-tertiary" />
                  </div>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
              {filtered.length === 0 && (
                <p className="px-(--of-space-md) py-(--of-space-sm) text-[13px] text-text-tertiary">
                  No sessions match this filter
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
