"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { GitBranch } from "lucide-react";
import { NewSessionInput } from "@/components/session/new-session-input";
import { SessionsDrawer } from "./sessions-drawer";
import type { SessionCardSession } from "./session-card";

const ChatPanel = dynamic(
  () => import("@/components/session/chat-panel").then((m) => ({ default: m.ChatPanel })),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Loading chat…
      </div>
    ),
  },
);

interface ActiveSession {
  id: string;
  firstMessage: string;
  modelId: string;
  repoPath?: string;
  branch?: string;
}

interface SessionsViewProps {
  defaultModelId?: string;
  sessions: SessionCardSession[];
  projectNames?: Record<string, string>;
  projectFilter?: string;
  defaultRepo?: string;
  defaultBranch?: string;
  projectId?: string;
}

export function SessionsView({ defaultModelId, sessions, projectNames, projectFilter, defaultRepo, defaultBranch, projectId }: SessionsViewProps) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const router = useRouter();

  const handleSessionCreated = useCallback(
    (session: { id: string; firstMessage: string; modelId: string }, context?: { repo?: string; branch?: string }) => {
      setActiveSession({
        ...session,
        repoPath: context?.repo,
        branch: context?.branch,
      });
      router.replace(`/sessions/${session.id}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="absolute inset-0 flex">
      <div className="flex min-w-0 flex-1 flex-col">
        {activeSession ? (
          <>
            {/* Slim context bar */}
            <div className="shrink-0 flex items-center gap-3 border-b border-stroke-subtle px-(--of-space-md) py-2">
              {activeSession.repoPath ? (
                <span className="flex items-center gap-1.5 text-[12px] font-mono text-text-tertiary">
                  <GitBranch className="h-3 w-3" />
                  {activeSession.repoPath}
                  {activeSession.branch ? (
                    <span className="text-text-tertiary/60"> : {activeSession.branch}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-[12px] text-text-tertiary">scratch</span>
              )}
              <button
                onClick={() => {
                  setActiveSession(null);
                  router.replace("/sessions", { scroll: false });
                }}
                className="ml-auto text-[12px] text-text-tertiary hover:text-text-primary transition-colors"
              >
                New session
              </button>
            </div>

            {/* Chat fills remaining space */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatPanel
                sessionId={activeSession.id}
                activeRunId={null}
                initialMessages={[
                  {
                    id: crypto.randomUUID(),
                    role: "user" as const,
                    parts: [{ type: "text" as const, text: activeSession.firstMessage }],
                    createdAt: new Date().toISOString(),
                  },
                ]}
                modelId={activeSession.modelId}
                autoStream
              />
            </div>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-(--of-space-lg)" />
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-stroke-subtle px-(--of-space-lg) py-(--of-space-md)">
              <div className="mx-auto max-w-2xl">
                <NewSessionInput
                  defaultModelId={defaultModelId}
                  defaultRepo={defaultRepo}
                  defaultBranch={defaultBranch}
                  projectId={projectId}
                  onSessionCreated={handleSessionCreated}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <SessionsDrawer sessions={sessions} projectNames={projectNames} projectFilter={projectFilter} />
    </div>
  );
}
