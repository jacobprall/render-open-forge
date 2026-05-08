"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import dynamic from "next/dynamic";
import { useEventSource } from "@/hooks/use-event-source";
import type { StreamEvent } from "@openforge/shared";
import type { AssistantPart } from "@openforge/ui";
import { appendStreamEvent } from "@openforge/ui";

const Markdown = dynamic(
  () => import("@/components/markdown").then((m) => ({ default: m.Markdown })),
  { ssr: false, loading: () => <span className="text-xs text-zinc-500">…</span> },
);

const ToolCallLazy = dynamic(
  () => import("@/components/tool-call").then((m) => ({ default: m.ToolCall })),
  { ssr: false, loading: () => <span className="text-xs text-zinc-500">…</span> },
);

export interface Message {
  id: string;
  role: "user" | "assistant";
  parts: AssistantPart[];
  createdAt: string;
}

export interface LiveFileChange {
  path: string;
  additions: number;
  deletions: number;
}

interface ChatPanelProps {
  sessionId: string;
  chatId: string | null;
  activeRunId: string | null;
  initialMessages: Message[];
  modelId: string;
  onModelChange: (id: string) => void;
  onFileChanges?: (files: LiveFileChange[]) => void;
}

export function ChatPanel({
  sessionId,
  chatId: _chatId,
  activeRunId,
  initialMessages,
  modelId,
  onModelChange,
  onFileChanges,
}: ChatPanelProps) {
  void _chatId;
  void onModelChange;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingParts, setStreamingParts] = useState<AssistantPart[]>([]);
  const [askUserPrompt, setAskUserPrompt] = useState<{
    question: string;
    options: string[];
    toolCallId?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveFileChanges, setLiveFileChanges] = useState<LiveFileChange[]>([]);
  const [filesPanelOpen, setFilesPanelOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [streamGeneration, setStreamGeneration] = useState(0);
  const streamUrl = useMemo(
    () => `/api/sessions/${sessionId}/stream?sg=${streamGeneration}`,
    [sessionId, streamGeneration],
  );
  const onFileChangesRef = useRef(onFileChanges);
  onFileChangesRef.current = onFileChanges;

  const pushLiveFileChange = useCallback((fp: string, additions: number, deletions: number) => {
    if (!fp) return;
    setLiveFileChanges((prev) => {
      const rest = prev.filter((x) => x.path !== fp);
      return [...rest, { path: fp, additions, deletions }].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
    });
  }, []);

  useEffect(() => {
    onFileChangesRef.current?.(liveFileChanges);
  }, [liveFileChanges]);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingParts, scrollToBottom]);

  const finishStreaming = useCallback(() => {
    setStreamingParts((parts) => {
      if (parts.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      return [];
    });
    setIsStreaming(false);
    setLiveFileChanges([]);
    onFileChangesRef.current?.([]);
  }, []);

  const streamMessageRef = useRef<(event: MessageEvent) => void>(() => {});
  streamMessageRef.current = (event: MessageEvent) => {
    try {
      const raw = JSON.parse(event.data) as Record<string, unknown>;
      const type = raw.type as string;

      if (type === "connected" || type === "no_active_run") return;

      if (type === "ask_user") {
        setAskUserPrompt({
          question: (raw.question as string) ?? "",
          options: (raw.options as string[]) ?? [],
          toolCallId: raw.toolCallId as string | undefined,
        });
        return;
      }

      if (type === "file_changed") {
        startTransition(() => {
          setStreamingParts((prev) => appendStreamEvent(prev, raw as unknown as StreamEvent));
        });
        const fp = (raw.path as string) ?? "";
        pushLiveFileChange(fp, (raw.additions as number) ?? 0, (raw.deletions as number) ?? 0);
        return;
      }

      if (type === "done" || type === "aborted") {
        finishStreaming();
        return;
      }

      if (type === "error") {
        setError((raw.message as string) ?? "An error occurred");
        finishStreaming();
        return;
      }

      startTransition(() => {
        setStreamingParts((prev) => appendStreamEvent(prev, raw as unknown as StreamEvent));
      });
    } catch {
      // ignore parse errors
    }
  };

  const onStreamMessage = useCallback((e: MessageEvent) => {
    streamMessageRef.current(e);
  }, []);

  const streamErrorRef = useRef<() => void>(() => {});
  streamErrorRef.current = () => {
    finishStreaming();
  };
  const onStreamError = useCallback(() => {
    streamErrorRef.current();
  }, []);

  useEventSource({
    url: streamUrl,
    enabled: isStreaming,
    onMessage: onStreamMessage,
    onError: onStreamError,
    maxReconnectAttempts: 0,
  });

  const pendingAsk = useMemo(() => {
    if (!activeRunId && !isStreaming) return null;
    for (let i = streamingParts.length - 1; i >= 0; i--) {
      const p = streamingParts[i];
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
  }, [activeRunId, isStreaming, streamingParts, messages]);

  async function stopStreaming() {
    try {
      await fetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
    } catch {
      // best effort
    }
    finishStreaming();
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: content }],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);

    try {
      const body: Record<string, unknown> = { content };
      if (modelId) body.modelId = modelId;

      const res = await fetch(`/api/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to send message" }));
        setError(data.error ?? "Failed to send message");
        return;
      }

      setStreamingParts([]);
      setError(null);
      setStreamGeneration((g) => g + 1);
      setIsStreaming(true);
    } catch {
      setError("Network error — failed to send message");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  async function submitAskUserReply(answer: string) {
    if (!askUserPrompt?.toolCallId || !activeRunId) return;
    setAskUserPrompt(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolCallId: askUserPrompt.toolCallId,
          message: answer,
          runId: activeRunId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Reply failed" }));
        setError(data.error ?? "Failed to send reply to agent");
      }
    } catch {
      setError("Network error — reply failed");
    }
  }

  function handleAskUserResponse(answer: string) {
    if (askUserPrompt?.toolCallId && activeRunId) {
      void submitAskUserReply(answer);
      return;
    }
    sendMessage(answer);
  }

  const askResolved = askUserPrompt ?? pendingAsk;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl flex flex-col gap-4">
          {liveFileChanges.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-300"
                onClick={() => setFilesPanelOpen((o) => !o)}
              >
                <span>Files changed — {liveFileChanges.length}</span>
                <svg
                  className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${filesPanelOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {filesPanelOpen ? (
                <ul className="divide-y divide-zinc-800/50 border-t border-zinc-800 max-h-48 overflow-y-auto text-xs font-mono px-3 py-1 contain-content">
                  {liveFileChanges.map((f) => (
                    <li key={f.path} className="py-1.5 flex justify-between gap-2">
                      <span className="truncate text-zinc-400">{f.path}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="text-accent-text">+{f.additions}</span>
                        <span className="text-zinc-600 mx-1">/</span>
                        <span className="text-danger">-{f.deletions}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-bg">
                <svg
                  className="h-6 w-6 text-accent-text"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                  />
                </svg>
              </div>
              <p className="font-medium text-zinc-200">Start a conversation</p>
              <p className="text-sm text-zinc-500">Ask the agent to help with your codebase.</p>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}

          {isStreaming && streamingParts.length > 0 ? (
            <div className="flex justify-start [content-visibility:auto]">
              <div className="max-w-[95%] sm:max-w-[85%]">
                <AssistantParts parts={streamingParts} streaming />
              </div>
            </div>
          ) : null}

          {isStreaming && streamingParts.length === 0 ? (
            <div className="flex items-center gap-2.5 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-[bounce_1.4s_ease-in-out_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
              </span>
              Thinking…
            </div>
          ) : null}

          {askResolved ? (
            <AskUserCard ask={askResolved} onRespond={handleAskUserResponse} />
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800 px-4 py-3">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 transition focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/25">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the agent…"
              rows={1}
              className="max-h-36 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-600"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
                Send
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function AskUserCard({
  ask,
  onRespond,
}: {
  ask: { question?: string; options?: string[] };
  onRespond: (answer: string) => void;
}) {
  const question = "question" in ask ? (ask as { question: string }).question : "";
  const options = "options" in ask ? ((ask as { options?: string[] }).options ?? []) : [];

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="mb-1 text-xs font-medium text-amber-400/70">Agent needs your input</p>
      <p className="mb-3 text-sm text-amber-200">{question}</p>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((opt: string) => (
            <button
              key={opt}
              type="button"
              onClick={() => onRespond(opt)}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const answer = formData.get("answer") as string;
            if (answer?.trim()) onRespond(answer);
          }}
          className="flex gap-2"
        >
          <input
            name="answer"
            className="flex-1 rounded-lg border border-amber-500/30 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
            placeholder="Type your answer…"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
          >
            Reply
          </button>
        </form>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end [content-visibility:auto]">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2 text-[13px] leading-relaxed text-white shadow-sm">
          {message.parts
            .filter((p) => p.type === "text")
            .map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {p.text}
              </p>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start [content-visibility:auto]">
      <div className="max-w-[95%] sm:max-w-[88%]">
        <AssistantParts parts={message.parts} />
      </div>
    </div>
  );
}

function AssistantParts({ parts, streaming }: { parts: AssistantPart[]; streaming?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {parts.map((part, i) => {
        switch (part.type) {
          case "text":
            return <Markdown key={i}>{part.text}</Markdown>;

          case "tool_call":
            return (
              <ToolCallLazy
                key={i}
                toolName={part.toolName ?? "tool"}
                args={part.args as Record<string, unknown> | undefined}
                result={part.result as Record<string, unknown> | undefined}
                status={part.result !== undefined ? "success" : streaming ? "running" : "idle"}
              />
            );

          case "file_changed":
            return (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 text-[11px] border border-zinc-800/60 rounded-md px-2 py-1 bg-zinc-900/40"
              >
                <span className="text-accent-text/80 tabular-nums font-mono">+{part.additions}</span>
                <span className="text-zinc-700">/</span>
                <span className="text-danger/80 tabular-nums font-mono">-{part.deletions}</span>
                <span className="ml-1 font-mono text-zinc-500 break-all">{part.path}</span>
              </div>
            );

          case "task":
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[11px] border border-zinc-800/60 rounded-md px-2.5 py-1.5 bg-zinc-900/40"
              >
                {part.status === "running" ? (
                  <svg className="h-3 w-3 animate-spin text-amber-400/80" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {part.status === "done" ? (
                  <svg className="h-3 w-3 text-accent-text/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
                {part.status === "error" ? (
                  <svg className="h-3 w-3 text-danger/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : null}
                <span className="text-zinc-400">{part.task}</span>
                {part.result != null && String(part.result).length > 0 ? (
                  <span className="ml-auto text-zinc-600">{String(part.result)}</span>
                ) : null}
                {part.error != null && String(part.error).length > 0 ? (
                  <span className="ml-auto text-danger/80">{String(part.error)}</span>
                ) : null}
              </div>
            );

          case "ask_user":
            return null;

          default:
            return null;
        }
      })}
      {streaming ? (
        <span className="inline-flex items-center gap-0.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-[bounce_1.4s_ease-in-out_infinite]" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
        </span>
      ) : null}
    </div>
  );
}
