"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { StreamEvent, AssistantPart } from "@render-open-forge/shared/client";
import { appendStreamEvent } from "@render-open-forge/shared/client";
import { Markdown } from "@/components/markdown";
import { ToolCall } from "@/components/tool-call";
import { ModelSelector } from "@/components/model-selector";

interface Message {
  id: string;
  role: "user" | "assistant";
  parts: AssistantPart[];
  createdAt: string;
}

interface LiveFileChange {
  path: string;
  additions: number;
  deletions: number;
}

interface ChatPanelProps {
  sessionId: string;
  chatId: string | null;
  activeRunId: string | null;
  initialMessages: Message[];
}

export function ChatPanel({ sessionId, chatId: _chatId, activeRunId, initialMessages }: ChatPanelProps) {
  void _chatId;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState<string>("");
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingParts, scrollToBottom]);

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

  function connectToStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsStreaming(true);
    setStreamingParts([]);
    setError(null);

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
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
          setStreamingParts((prev) => appendStreamEvent(prev, raw as unknown as StreamEvent));
          const fp = (raw.path as string) ?? "";
          if (fp) {
            setLiveFileChanges((prev) => {
              const rest = prev.filter((x) => x.path !== fp);
              return [
                ...rest,
                { path: fp, additions: (raw.additions as number) ?? 0, deletions: (raw.deletions as number) ?? 0 },
              ].sort((a, b) => a.path.localeCompare(b.path));
            });
          }
          return;
        }

        if (type === "done" || type === "aborted") {
          finishStreaming();
          es.close();
          return;
        }

        if (type === "error") {
          setError((raw.message as string) ?? "An error occurred");
          finishStreaming();
          es.close();
          return;
        }

        setStreamingParts((prev) => appendStreamEvent(prev, raw as unknown as StreamEvent));
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      finishStreaming();
      es.close();
    };
  }

  function finishStreaming() {
    setIsStreaming(false);
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
    setLiveFileChanges([]);
  }

  async function stopStreaming() {
    try {
      await fetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
    } catch {
      // best effort
    }
    eventSourceRef.current?.close();
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

      connectToStream();
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Chat toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {isStreaming && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Agent working
            </span>
          )}
        </div>
        <ModelSelector
          value={modelId}
          onChange={setModelId}
          compact
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl flex flex-col gap-5">
          {/* Inline files changed panel */}
          {liveFileChanges.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-zinc-300"
                onClick={() => setFilesPanelOpen((o) => !o)}
              >
                <span>
                  Files changed — {liveFileChanges.length}
                </span>
                <svg
                  className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${filesPanelOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {filesPanelOpen && (
                <ul className="divide-y divide-zinc-800/50 border-t border-zinc-800 max-h-48 overflow-y-auto text-xs font-mono px-3 py-1">
                  {liveFileChanges.map((f) => (
                    <li key={f.path} className="py-1.5 flex justify-between gap-2">
                      <span className="truncate text-zinc-400">{f.path}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="text-emerald-400">+{f.additions}</span>
                        <span className="text-zinc-600 mx-1">/</span>
                        <span className="text-red-400">-{f.deletions}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
              <p className="font-medium text-zinc-200">Start a conversation</p>
              <p className="text-sm text-zinc-500">
                Ask the agent to help with your codebase.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Streaming assistant message */}
          {isStreaming && streamingParts.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[95%] sm:max-w-[85%]">
                <AssistantParts parts={streamingParts} streaming />
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && streamingParts.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Thinking…
            </div>
          )}

          {/* Ask user prompt */}
          {(askUserPrompt || pendingAsk) && (() => {
            const ask = askUserPrompt ?? pendingAsk;
            if (!ask) return null;
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
                        onClick={() => handleAskUserResponse(opt)}
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
                      if (answer?.trim()) handleAskUserResponse(answer);
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
          })()}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 transition focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/25">
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
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-600 px-4 py-2.5 text-sm text-white">
          {message.parts
            .filter((p) => p.type === "text")
            .map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">{p.text}</p>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] sm:max-w-[85%]">
        <AssistantParts parts={message.parts} />
      </div>
    </div>
  );
}

function AssistantParts({ parts, streaming }: { parts: AssistantPart[]; streaming?: boolean }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {parts.map((part, i) => {
        switch (part.type) {
          case "text":
            return <Markdown key={i}>{part.text}</Markdown>;

          case "tool_call":
            return (
              <ToolCall
                key={i}
                toolName={part.toolName ?? "tool"}
                args={part.args as Record<string, unknown> | undefined}
                result={part.result as Record<string, unknown> | undefined}
                status={part.result !== undefined ? "success" : streaming ? "running" : "idle"}
              />
            );

          case "file_changed":
            return (
              <div key={i} className="text-xs border border-zinc-800 rounded-lg px-2.5 py-1.5 bg-zinc-900/50">
                <span className="text-emerald-400 tabular-nums">+{part.additions}</span>
                <span className="text-zinc-600 mx-1">/</span>
                <span className="text-red-400 tabular-nums">-{part.deletions}</span>
                <span className="ml-2 font-mono text-zinc-400 break-all">{part.path}</span>
              </div>
            );

          case "task":
            return (
              <div key={i} className="flex items-center gap-2 text-xs border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-900/50">
                {part.status === "running" && (
                  <svg className="h-3.5 w-3.5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {part.status === "done" && (
                  <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {part.status === "error" && (
                  <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="text-zinc-300">{part.task}</span>
                {part.result && <span className="ml-auto text-zinc-500">{part.result}</span>}
                {part.error && <span className="ml-auto text-red-400">{part.error}</span>}
              </div>
            );

          case "ask_user":
            return null;

          default:
            return null;
        }
      })}
      {streaming && (
        <span className="inline-block w-1.5 h-4 bg-emerald-400/70 animate-pulse rounded-sm" />
      )}
    </div>
  );
}
