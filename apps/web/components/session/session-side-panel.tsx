"use client";

import { useState, useCallback, useRef } from "react";
import useSWR from "swr";
import { useEventSource } from "@/hooks/use-event-source";
import { STREAM_EVENT } from "@/lib/stream-events";

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
  const [sseCiStatus, setSseCiStatus] = useState<"idle" | "running" | "success" | "failure">("idle");

  const streamUrl = `/api/sessions/${sessionId}/stream`;
  const streamMessageRef = useRef<(event: MessageEvent) => void>(() => {});
  streamMessageRef.current = (event: MessageEvent) => {
    const rawData =
      typeof event.data === "string" ? event.data : String(event.data ?? "");
    try {
      const data = JSON.parse(rawData);
      if (data.type === STREAM_EVENT.FILE_CHANGED && data.path) {
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
      if (data.type === STREAM_EVENT.TASK_START) setSseCiStatus("running");
      if (data.type === STREAM_EVENT.TASK_DONE) setSseCiStatus("success");
      if (data.type === STREAM_EVENT.TASK_ERROR) setSseCiStatus("failure");
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[SSE parse error]", e, rawData.slice(0, 200));
      }
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

  const ciEventsUrl = `/api/sessions/${sessionId}/ci-events`;

  const { data: ciEventsPayload } = useSWR(
    activeTab === "ci" ? ciEventsUrl : null,
    async (u) => {
      try {
        const res = await fetch(u);
        if (!res.ok) return null;
        return (await res.json()) as {
          events: Array<{ type: string; status: string | null }>;
        };
      } catch {
        return null;
      }
    },
    { refreshInterval: 5000 },
  );

  const ciEvents = activeTab === "ci" ? (ciEventsPayload?.events ?? []) : [];
  const lastPoll = ciEvents[0];
  const polledStatus: "running" | "success" | "failure" | null =
    activeTab === "ci" && lastPoll?.status
      ? lastPoll.status === "success"
        ? "success"
        : lastPoll.status === "running" || lastPoll.status === "pending"
          ? "running"
          : "failure"
      : null;
  const ciStatus = polledStatus ?? sseCiStatus;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-full w-10 items-center justify-center border-l border-stroke-subtle text-text-tertiary transition-colors duration-(--of-duration-instant) hover:bg-surface-1 hover:text-text-secondary"
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
    <div className="flex w-80 flex-col border-l border-stroke-subtle">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-stroke-subtle px-4 py-3">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`px-2.5 py-1 text-xs font-medium transition-colors duration-(--of-duration-instant) ${
              activeTab === "files"
                ? "bg-surface-2 text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ci")}
            className={`px-2.5 py-1 text-xs font-medium transition-colors duration-(--of-duration-instant) ${
              activeTab === "ci"
                ? "bg-surface-2 text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            CI
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-text-tertiary transition-colors duration-(--of-duration-instant) hover:text-text-secondary"
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
              <p className="text-center text-sm text-text-tertiary">No files changed yet.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between text-xs text-text-tertiary">
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
                      className="flex items-center justify-between px-2 py-1.5 text-xs hover:bg-surface-2/50"
                    >
                      <span className="truncate font-mono text-text-secondary" title={file.path}>
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
                  <div className="h-2.5 w-2.5 rounded-full bg-text-tertiary" />
                  <span className="text-sm text-text-tertiary">No webhook activity yet.</span>
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
              <p className="text-xs text-text-tertiary">
                Configure a webhook to <span className="font-mono">/api/webhooks</span>
                {' '}with a shared secret to populate CI signals.
              </p>
            ) : (
              <ul className="space-y-2 text-xs text-text-tertiary">
                {ciEvents.slice(0, 20).map((ev, i) => (
                  <li key={`${ev.type}-${i}`} className="border border-stroke-subtle bg-surface-1/60 px-2 py-1.5">
                    <span className="font-mono text-text-secondary">{ev.type}</span>
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
