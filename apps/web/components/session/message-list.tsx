"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AssistantPart } from "@openforge/ui";
import type { Message } from "./use-chat-messages";
import type { LiveFileChange } from "./use-chat-stream";
import { AskUserCard } from "./ask-user-card";

const Markdown = dynamic(
  () => import("@/components/markdown").then((m) => ({ default: m.Markdown })),
  { ssr: false, loading: () => <span className="text-xs text-zinc-500">…</span> },
);

const ToolCallLazy = dynamic(
  () => import("@/components/tool-call").then((m) => ({ default: m.ToolCall })),
  { ssr: false, loading: () => <span className="text-xs text-zinc-500">…</span> },
);

export function MessageArea({
  messages,
  streamingParts,
  isStreaming,
  liveFileChanges,
  askResolved,
  onAskUserResponse,
  error,
}: {
  messages: Message[];
  streamingParts: AssistantPart[];
  isStreaming: boolean;
  liveFileChanges: LiveFileChange[];
  askResolved: { question?: string; options?: string[] } | null;
  onAskUserResponse: (answer: string) => void;
  error: string | null;
}) {
  const [filesPanelOpen, setFilesPanelOpen] = useState(true);

  return (
    <>
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
        <AskUserCard ask={askResolved} onRespond={onAskUserResponse} />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : null}
    </>
  );
}

export function MessageBubble({ message }: { message: Message }) {
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

export function AssistantParts({ parts, streaming }: { parts: AssistantPart[]; streaming?: boolean }) {
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
