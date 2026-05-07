"use client";

import { useState, useCallback } from "react";
import type { AssistantPart } from "@render-open-forge/shared/client";
import { ChatPanel } from "./chat-panel";
import { FilesView } from "./files-view";
import { ModelSelector } from "@/components/model-selector";
import type { Message, LiveFileChange } from "./chat-panel";

type ViewTab = "chat" | "files";

interface SessionInfo {
  id: string;
  title: string;
  repoPath: string | null;
  branch: string | null;
  activeSkills: Array<{ source: string; slug: string }>;
  status: string;
  prNumber: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
}

const DEFAULT_CHAT_MODEL_ID = "anthropic/claude-sonnet-4-5";

interface SessionWorkspaceProps {
  session: SessionInfo;
  /** Chat row / user default model — keeps the header selector aligned with what messages use */
  initialModelId?: string | null;
  chatId: string | null;
  activeRunId: string | null;
  initialMessages: {
    id: string;
    role: "user" | "assistant";
    parts: AssistantPart[];
    createdAt: string;
  }[];
}

const statusDot: Record<string, string> = {
  running: "bg-emerald-500",
  completed: "bg-blue-500",
  failed: "bg-red-500",
  archived: "bg-zinc-500",
};

export function SessionWorkspace({
  session,
  initialModelId,
  chatId,
  activeRunId,
  initialMessages,
}: SessionWorkspaceProps) {
  const [activeView, setActiveView] = useState<ViewTab>("chat");
  const [modelId, setModelId] = useState(() => {
    const id = initialModelId?.trim();
    return id && id.length > 0 ? id : DEFAULT_CHAT_MODEL_ID;
  });
  const [liveFileChanges, setLiveFileChanges] = useState<LiveFileChange[]>([]);

  const handleFileChanges = useCallback((files: LiveFileChange[]) => {
    setLiveFileChanges(files);
  }, []);

  const fileCount = liveFileChanges.length;

  return (
    <div className="flex h-full flex-col">
      {/* Workspace header: metadata row + tab bar */}
      <header className="shrink-0 border-b border-zinc-800">
        {/* Metadata row */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div className="flex items-center gap-2 min-w-0 text-[11px]">
            {session.repoPath && (
              <span className="font-mono text-zinc-500 truncate">
                {session.repoPath}
                {session.branch && (
                  <span className="text-zinc-600"> : {session.branch}</span>
                )}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-zinc-500">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot[session.status] ?? "bg-zinc-600"}`} />
              {session.status}
            </span>
            {(session.activeSkills?.length ?? 0) > 0 ? (
              <span className="flex max-w-[200px] flex-wrap items-center gap-0.5 sm:max-w-none">
                {session.activeSkills!.slice(0, 8).map((s) => (
                  <span
                    key={`${s.source}-${s.slug}`}
                    className="rounded border border-zinc-700/80 px-1 font-mono text-[10px] text-zinc-500"
                  >
                    {s.slug}
                  </span>
                ))}
                {session.activeSkills!.length > 8 ? (
                  <span className="text-[10px] text-zinc-600">+{session.activeSkills!.length - 8}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-[10px] text-zinc-600">default skills</span>
            )}
            {session.prNumber && (
              <a
                href={`/${session.repoPath}/pulls/${session.prNumber}`}
                className="text-blue-400 hover:text-blue-300 font-mono"
              >
                PR #{session.prNumber}
              </a>
            )}
            {(session.linesAdded || session.linesRemoved) ? (
              <span className="font-mono tabular-nums">
                <span className="text-emerald-400/70">+{session.linesAdded ?? 0}</span>
                <span className="text-zinc-700 mx-0.5">/</span>
                <span className="text-red-400/70">-{session.linesRemoved ?? 0}</span>
              </span>
            ) : null}
          </div>
          <div className="shrink-0">
            <ModelSelector value={modelId} onChange={setModelId} compact />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 px-4 -mb-px">
          <TabButton
            active={activeView === "chat"}
            onClick={() => setActiveView("chat")}
          >
            Chat
          </TabButton>
          <TabButton
            active={activeView === "files"}
            onClick={() => setActiveView("files")}
            badge={fileCount > 0 ? fileCount : undefined}
          >
            Files
          </TabButton>
        </div>
      </header>

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        <div className={activeView === "chat" ? "h-full" : "hidden"}>
          <ChatPanel
            sessionId={session.id}
            chatId={chatId}
            activeRunId={activeRunId}
            initialMessages={initialMessages as Message[]}
            modelId={modelId}
            onModelChange={setModelId}
            onFileChanges={handleFileChanges}
          />
        </div>
        <div className={activeView === "files" ? "h-full" : "hidden"}>
          <FilesView
            sessionId={session.id}
            fileChanges={liveFileChanges}
          />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "text-zinc-100"
          : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
      {badge !== undefined && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-700 px-1 text-[10px] tabular-nums text-zinc-300">
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-3 right-3 h-px bg-emerald-500" />
      )}
    </button>
  );
}
