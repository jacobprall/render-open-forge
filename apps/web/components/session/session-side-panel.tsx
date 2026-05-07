"use client";

import { useState, useEffect } from "react";

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

  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSource.onmessage = (event) => {
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
    return () => eventSource.close();
  }, [sessionId]);

  if (!isOpen) {
    return (
      <button
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
                    <span className="text-emerald-400">+{totalAdditions}</span>
                    {" "}
                    <span className="text-red-400">-{totalDeletions}</span>
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
                        <span className="text-emerald-400">+{file.additions}</span>
                        {" "}
                        <span className="text-red-400">-{file.deletions}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "ci" && (
          <div className="p-4">
            <div className="flex items-center gap-2">
              {ciStatus === "idle" && (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                  <span className="text-sm text-zinc-500">No CI runs</span>
                </>
              )}
              {ciStatus === "running" && (
                <>
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
                  <span className="text-sm text-amber-400">Running</span>
                </>
              )}
              {ciStatus === "success" && (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm text-emerald-400">Passed</span>
                </>
              )}
              {ciStatus === "failure" && (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="text-sm text-red-400">Failed</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
