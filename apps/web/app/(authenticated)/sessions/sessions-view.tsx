"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
}

interface SessionsViewProps {
  defaultModelId?: string;
  sessions: SessionCardSession[];
  projectNames?: Record<string, string>;
  projectFilter?: string;
}

export function SessionsView({ defaultModelId, sessions, projectNames, projectFilter }: SessionsViewProps) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const router = useRouter();

  const handleSessionCreated = useCallback(
    (session: ActiveSession) => {
      setActiveSession(session);
      router.replace(`/sessions/${session.id}`, { scroll: false });
    },
    [router],
  );

  if (activeSession) {
    return (
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 overflow-hidden">
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
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-(--of-space-lg)">
            <h1 className="mb-(--of-space-xs) text-[20px] text-text-primary">
              What do you want to build?
            </h1>
            <p className="text-[14px] text-text-tertiary">
              Pick a repo, describe your task, and start a session.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-stroke-subtle px-(--of-space-lg) py-(--of-space-md)">
          <div className="mx-auto max-w-2xl">
            <NewSessionInput
              defaultModelId={defaultModelId}
              onSessionCreated={handleSessionCreated}
            />
          </div>
        </div>
      </div>

      <SessionsDrawer sessions={sessions} projectNames={projectNames} projectFilter={projectFilter} />
    </div>
  );
}
