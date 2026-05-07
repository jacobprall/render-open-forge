"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { StreamEvent, AssistantPart } from "@render-open-forge/shared/client";
import { appendStreamEvent } from "@render-open-forge/shared/client";
import { Markdown } from "@/components/markdown";
import { ToolCall } from "@/components/tool-call";

interface Message {
  id: string;
  role: "user" | "assistant";
  parts: AssistantPart[];
  createdAt: string;
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingParts, setStreamingParts] = useState<AssistantPart[]>([]);
  const [askUserPrompt, setAskUserPrompt] = useState<{ question: string; options: string[]; toolCallId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingParts, scrollToBottom]);

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

        if (type === "done") {
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

        if (type === "aborted") {
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
      const res = await fetch(`/api/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
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
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming content */}
          {isStreaming && streamingParts.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <PartsRenderer parts={streamingParts} isStreaming />
            </div>
          )}

          {/* Streaming indicator with no parts yet */}
          {isStreaming && streamingParts.length === 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <span className="animate-pulse text-sm text-zinc-400">Thinking…</span>
            </div>
          )}

          {/* Ask user prompt */}
          {askUserPrompt && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="mb-3 text-sm text-amber-300">{askUserPrompt.question}</p>
              {askUserPrompt.options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {askUserPrompt.options.map((opt) => (
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
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 px-6 py-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2 focus-within:border-emerald-500">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message…"
              rows={1}
              className="max-h-36 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
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

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg p-4 ${
          isUser
            ? "border border-emerald-500/20 bg-emerald-600/20"
            : "border border-zinc-800 bg-zinc-900/50"
        }`}
      >
        <PartsRenderer parts={message.parts} isStreaming={false} />
      </div>
    </div>
  );
}

function PartsRenderer({ parts, isStreaming }: { parts: AssistantPart[]; isStreaming: boolean }) {
  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case "text":
            return (
              <div key={i}>
                <Markdown>{part.text}</Markdown>
                {isStreaming && i === parts.length - 1 && (
                  <span className="animate-pulse text-emerald-400">▊</span>
                )}
              </div>
            );

          case "tool_call":
            return (
              <div key={i} className="mt-2">
                <ToolCall
                  toolName={part.toolName}
                  args={part.args as Record<string, unknown> | undefined}
                  result={part.result}
                  status={!part.result && isStreaming ? "running" : part.result ? "success" : "idle"}
                />
              </div>
            );

          case "file_changed":
            return (
              <div key={i} className="mt-2 rounded border border-zinc-700 bg-zinc-800/50 p-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-300">{part.path}</span>
                  <span className="ml-auto font-mono text-xs">
                    <span className="text-emerald-400">+{part.additions}</span>{" "}
                    <span className="text-red-400">-{part.deletions}</span>
                  </span>
                </div>
              </div>
            );

          case "task":
            return (
              <div key={i} className="mt-2 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800/50 p-2">
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
                <span className="text-xs text-zinc-300">{part.task}</span>
                {part.result && <span className="ml-auto text-xs text-zinc-500">{part.result}</span>}
                {part.error && <span className="ml-auto text-xs text-red-400">{part.error}</span>}
              </div>
            );

          case "ask_user":
            return null;

          default:
            return null;
        }
      })}
    </>
  );
}
