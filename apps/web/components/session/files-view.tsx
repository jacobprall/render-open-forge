"use client";

import { useState, useMemo } from "react";
import type { LiveFileChange } from "./chat-panel";

interface FilesViewProps {
  sessionId: string;
  fileChanges: LiveFileChange[];
}

export function FilesView({ sessionId, fileChanges }: FilesViewProps) {
  void sessionId;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const totalAdded = fileChanges.reduce((s, f) => s + f.additions, 0);
  const totalRemoved = fileChanges.reduce((s, f) => s + f.deletions, 0);

  const selectedMeta = useMemo(
    () => (selectedFile ? fileChanges.find((x) => x.path === selectedFile) : undefined),
    [fileChanges, selectedFile],
  );

  if (fileChanges.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/50">
            <svg className="h-5 w-5 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500">No files changed yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            File changes will appear here as the agent works.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r border-zinc-800 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
          <span className="text-[11px] font-medium text-zinc-400">
            {fileChanges.length} file{fileChanges.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[11px] font-mono tabular-nums">
            <span className="text-emerald-400/70">+{totalAdded}</span>
            <span className="text-zinc-700 mx-0.5">/</span>
            <span className="text-red-400/70">-{totalRemoved}</span>
          </span>
        </div>
        <div className="py-1">
          {fileChanges.map((file) => {
            const filename = file.path.split("/").pop() ?? file.path;
            const dir = file.path.includes("/")
              ? file.path.slice(0, file.path.lastIndexOf("/"))
              : "";
            const isSelected = selectedFile === file.path;

            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedFile(isSelected ? null : file.path)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  isSelected
                    ? "bg-zinc-800/80 text-zinc-200"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-300"
                }`}
              >
                <svg className="h-3.5 w-3.5 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-mono truncate">{filename}</span>
                  {dir ? (
                    <span className="block text-[10px] text-zinc-600 font-mono truncate">{dir}</span>
                  ) : null}
                </div>
                <span className="shrink-0 text-[10px] font-mono tabular-nums">
                  <span className="text-emerald-400/60">+{file.additions}</span>
                  {" "}
                  <span className="text-red-400/60">-{file.deletions}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedFile ? (
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">{selectedFile}</span>
              {selectedMeta ? (
                <span className="text-[11px] font-mono tabular-nums">
                  <span className="text-emerald-400/70">+{selectedMeta.additions}</span>
                  <span className="text-zinc-700 mx-0.5">/</span>
                  <span className="text-red-400/70">-{selectedMeta.deletions}</span>
                </span>
              ) : null}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-xs text-zinc-500">
                Diff view coming soon. File was modified with{" "}
                {selectedMeta
                  ? `${selectedMeta.additions} additions and ${selectedMeta.deletions} deletions`
                  : "changes"}
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-zinc-600">Select a file to view changes</p>
          </div>
        )}
      </div>
    </div>
  );
}
