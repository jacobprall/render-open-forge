"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import Link from "next/link";
import { Send, GitBranch, MessageCircle } from "lucide-react";
import { useChatStream } from "@/components/session/use-chat-stream";
import { useChatMessages } from "@/components/session/use-chat-messages";
import type { Message } from "@/components/session/use-chat-messages";
import { MessageArea } from "@/components/session/message-list";
import { RepoBranchPicker } from "@/components/session/repo-branch-picker";
import { ModelSelector } from "@/components/model-selector";
import { DEFAULT_MODEL_ID } from "@/lib/model-defaults";

interface RecentSession {
  id: string;
  title: string | null;
  status: string;
  repoPath: string | null;
  createdAt: Date | null;
}

interface NewChatViewProps {
  defaultModelId?: string;
  defaultRepo?: string;
  defaultBranch?: string;
  projectId?: string;
  recentSessions?: RecentSession[];
}

export function NewChatView({
  defaultModelId,
  defaultRepo,
  defaultBranch,
  projectId,
  recentSessions = [],
}: NewChatViewProps) {
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [repoBranch, setRepoBranch] = useState<{ repo: string; branch: string } | null>(
    defaultRepo ? { repo: defaultRepo, branch: defaultBranch ?? "main" } : null,
  );
  const [modelId, setModelId] = useState(defaultModelId || DEFAULT_MODEL_ID);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const stream = useChatStream({ sessionId, setMessages, setError });

  const chat = useChatMessages({
    sessionId,
    modelId,
    activeRunId: null,
    isStreaming: stream.isStreaming,
    startStreaming: stream.startStreaming,
    finishStreaming: stream.finishStreaming,
    askUserPrompt: stream.askUserPrompt,
    setAskUserPrompt: stream.setAskUserPrompt,
    setError,
    setMessages,
  });

  const hasSession = sessionId.length > 0;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, stream.streamingParts, scrollToBottom]);

  const pendingAsk = useMemo(() => {
    if (!stream.isStreaming) return null;
    for (let i = stream.streamingParts.length - 1; i >= 0; i--) {
      const p = stream.streamingParts[i];
      if (p?.type === "ask_user" && p.toolCallId) return p;
    }
    for (let mi = messages.length - 1; mi >= 0; mi--) {
      const m = messages[mi];
      if (m?.role !== "assistant") continue;
      for (let j = m.parts.length - 1; j >= 0; j--) {
        const p = m.parts[j];
        if (p?.type === "ask_user" && p.toolCallId) return p;
      }
    }
    return null;
  }, [stream.isStreaming, stream.streamingParts, messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || creating || stream.isStreaming) return;

    setInput("");
    setError(null);

    if (!sessionIdRef.current) {
      setCreating(true);
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
        createdAt: new Date().toISOString(),
      };
      setMessages([userMessage]);

      try {
        const body: Record<string, string> = { firstMessage: text, modelId };
        if (repoBranch) {
          body.repoPath = repoBranch.repo;
          body.baseBranch = repoBranch.branch;
        }
        if (projectId) body.projectId = projectId;

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = typeof data.error === "string" ? data.error : `Failed to create session (${res.status})`;
          throw new Error(msg);
        }

        const data = await res.json();
        setSessionId(data.id);
        sessionIdRef.current = data.id;
        stream.startStreaming();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setCreating(false);
      }
      return;
    }

    void chat.sendMessage(text);
  }, [input, creating, stream, chat, modelId, repoBranch, projectId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleAskUserResponse(answer: string) {
    if (stream.askUserPrompt?.toolCallId) {
      void chat.submitAskUserReply(answer);
      return;
    }
    void chat.sendMessage(answer);
  }

  const askResolved = stream.askUserPrompt ?? pendingAsk;
  const hasMessages = messages.length > 0 || stream.streamingParts.length > 0;
  const canSend = input.trim().length > 0 && !creating && !stream.isStreaming;

  return (
    <div className="absolute inset-0 flex flex-col">
      {hasSession && (
        <div className="shrink-0 flex items-center gap-3 border-b border-stroke-subtle px-4 py-2">
          {repoBranch ? (
            <span className="flex items-center gap-1.5 text-[12px] font-mono text-text-tertiary">
              <GitBranch className="h-3 w-3" />
              {repoBranch.repo}
              <span className="text-text-tertiary/60"> : {repoBranch.branch}</span>
            </span>
          ) : (
            <span className="text-[12px] text-text-tertiary">scratch</span>
          )}
          <div className="ml-auto">
            <ModelSelector value={modelId} onChange={setModelId} compact />
          </div>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-(--of-space-md) py-(--of-space-xl)">
        {hasMessages ? (
          <div className="mx-auto max-w-2xl flex min-h-full flex-col justify-end gap-(--of-space-lg)">
            <MessageArea
              messages={messages}
              streamingParts={stream.streamingParts}
              isStreaming={stream.isStreaming}
              liveFileChanges={stream.liveFileChanges}
              askResolved={askResolved}
              onAskUserResponse={handleAskUserResponse}
              error={error}
            />
            <div ref={endRef} />
          </div>
        ) : !hasSession && recentSessions.length > 0 ? (
          <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-end pb-4">
            <h3 className="mb-2 self-start text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">
              Recent sessions
            </h3>
            <div className="w-full divide-y divide-stroke-subtle border border-stroke-subtle bg-surface-0">
              {recentSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/sessions/${s.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-(--of-duration-instant) hover:bg-surface-1"
                >
                  <MessageCircle className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
                    {s.title || "Untitled session"}
                  </span>
                  <span className="shrink-0 text-[11px] font-mono text-text-tertiary">
                    {s.repoPath ?? "scratch"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-stroke-subtle px-(--of-space-md) py-(--of-space-md)">
        <div className="mx-auto max-w-2xl">
          {!hasSession && (
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <RepoBranchPicker value={repoBranch} onChange={setRepoBranch} />
              <ModelSelector value={modelId} onChange={setModelId} compact />
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <div className="flex items-end gap-2 border border-stroke-default bg-surface-1 p-2 transition-colors duration-(--of-duration-instant) focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/25">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasSession ? "Message the agent…" : "Describe what you want to build…"}
                rows={hasSession ? 1 : 3}
                className="max-h-36 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-text-primary placeholder-text-tertiary outline-none"
                disabled={creating || stream.isStreaming}
              />
              {stream.isStreaming ? (
                <button
                  type="button"
                  onClick={() => void chat.stopStreaming()}
                  className="flex items-center gap-1.5 bg-surface-3 px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-(--of-duration-instant) hover:bg-surface-2"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="0" />
                  </svg>
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className="flex items-center gap-1.5 bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <span className="inline-flex animate-spin">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </span>
                      Starting…
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      {hasSession ? "Send" : "Start"}
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
          {error && !hasSession && (
            <p className="mt-2 text-[13px] text-danger">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
