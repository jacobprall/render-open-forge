"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEventSource } from "@/hooks/use-event-source";

interface FileChange {
  path: string;
  additions: number;
  deletions: number;
}

interface SessionSidePanelProps {
  sessionId: string;
}

export function SessionSidePanel({ sessionId }: SessionSidePanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"files" | "ci">("files");
  const [filesChanged, setFilesChanged] = useState<FileChange[]>([]);
  const [ciStatus, setCiStatus] = useState<"idle" | "running" | "success" | "failure">("idle");
  const [ciEvents, setCiEvents] = useState<Array<{ type: string; status: string | null }>>([]);

  const streamUrl = `/api/sessions/${sessionId}/stream`;
  const streamMessageRef = useRef<(event: MessageEvent) => void>(() => {});
  streamMessageRef.current = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "file_changed" && data.path) {
        setFilesChanged((prev) => {
          const existing = prev.find((f) => f.path === data.path);
          if (existing) {
            return prev.map((f) =>
              f.path === data.path
                ? { ...f, additions: data.additions ?? 0, deletions: data.deletions ?? 0 }
                : f,
            );
          }
          return [...prev, { path: data.path, additions: data.additions ?? 0, deletions: data.deletions ?? 0 }];
        });
      }
      if (data.type === "task_start") setCiStatus("running");
      if (data.type === "task_done") setCiStatus("success");
      if (data.type === "task_error") setCiStatus("failure");
    } catch {
      // ignore
    }
  };

  const onStreamMessage = useCallback((e: MessageEvent) => {
    streamMessageRef.current(e);
  }, []);

  useEventSource({
    url: streamUrl,
    enabled: true,
    onMessage: onStreamMessage,
  });

  useEffect(() => {
    if (activeTab !== "ci") return;
    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/ci-events`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          events: Array<{ type: string; status: string | null }>;
        };
        setCiEvents(data.events ?? []);
        const last = data.events?.[0];
        if (!last?.status) return;
        if (last.status === "success") setCiStatus("success");
        else if (last.status === "running" || last.status === "pending") setCiStatus("running");
        else setCiStatus("failure");
      } catch {
        // ignore
      }
    }
    void poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [activeTab, sessionId]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-full w-10 items-center justify-center border-l border-zinc-800 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300"
        title="Open side panel"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    );
  }

  const totalAdditions = filesChanged.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = filesChanged.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="flex w-80 flex-col border-l border-zinc-800">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              activeTab === "files"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ci")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              activeTab === "ci"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            CI
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-zinc-500 transition hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "files" && (
          <div className="p-4">
            {filesChanged.length === 0 ? (
              <p className="text-center text-sm text-zinc-500">No files changed yet.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
                  <span>{filesChanged.length} file{filesChanged.length !== 1 ? "s" : ""} changed</span>
                  <span className="font-mono">
                    <span className="text-accent-text">+{totalAdditions}</span>
                    {" "}
                    <span className="text-danger">-{totalDeletions}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  {filesChanged.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-zinc-800/50"
                    >
                      <span className="truncate font-mono text-zinc-300" title={file.path}>
                        {file.path.split("/").pop()}
                      </span>
                      <span className="ml-2 shrink-0 font-mono">
                        <span className="text-accent-text">+{file.additions}</span>
                        {" "}
                        <span className="text-danger">-{file.deletions}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "ci" && (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              {ciStatus === "idle" && (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                  <span className="text-sm text-zinc-500">No webhook activity yet.</span>
                </>
              )}
              {ciStatus === "running" && (
                <>
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
                  <span className="text-sm text-amber-400">Running / pending</span>
                </>
              )}
              {ciStatus === "success" && (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="text-sm text-accent-text">Passed</span>
                </>
              )}
              {ciStatus === "failure" && (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-sm text-danger">Failed</span>
                </>
              )}
            </div>

            {ciEvents.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Configure a webhook to <span className="font-mono">/api/webhooks</span>
                {' '}with a shared secret to populate CI signals.
              </p>
            ) : (
              <ul className="space-y-2 text-xs text-zinc-400">
                {ciEvents.slice(0, 20).map((ev, i) => (
                  <li key={`${ev.type}-${i}`} className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                    <span className="font-mono text-zinc-300">{ev.type}</span>
                    {ev.status ? (
                      <span
                        className={`ml-2 ${
                          ev.status === "success" ? "text-accent-text" : ev.status === "running" ? "text-warning" : "text-danger"
                        }`}
                      >
                        {ev.status}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
