"use client";

import dynamic from "next/dynamic";
import type { AssistantPart } from "@openforge/ui";

const Markdown = dynamic(
  () => import("@/components/markdown").then((m) => ({ default: m.Markdown })),
  { ssr: false, loading: () => <span className="text-xs text-text-tertiary">…</span> },
);

const ToolCallLazy = dynamic(
  () => import("@/components/tool-call").then((m) => ({ default: m.ToolCall })),
  { ssr: false, loading: () => <span className="text-xs text-text-tertiary">…</span> },
);

function partKey(part: AssistantPart, index: number): string {
  if ("id" in part && part.id) return part.id;
  if (part.type === "tool_call" && part.toolCallId) return part.toolCallId;
  if (part.type === "task" && part.taskId) return `task-${part.taskId}`;
  return `${part.type}-${index}`;
}

export function AssistantParts({ parts, streaming }: { parts: AssistantPart[]; streaming?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {parts.map((part, i) => {
        const key = partKey(part, i);
        switch (part.type) {
          case "text":
            return (
              <div key={key} className="inline-block border border-stroke-subtle bg-surface-1 px-(--of-space-md) py-(--of-space-md) shadow-xs text-[15px] leading-relaxed text-text-primary">
                <Markdown>{part.text}</Markdown>
              </div>
            );

          case "tool_call":
            return (
              <ToolCallLazy
                key={key}
                toolName={part.toolName ?? "tool"}
                args={part.args as Record<string, unknown> | undefined}
                result={part.result as Record<string, unknown> | undefined}
                status={part.result !== undefined ? "success" : streaming ? "running" : "idle"}
              />
            );

          case "file_changed":
            return (
              <div
                key={key}
                className="inline-flex items-center gap-1.5 text-[11px] border border-stroke-subtle px-2 py-1 bg-surface-1"
              >
                <span className="text-accent-text/80 tabular-nums font-mono">+{part.additions}</span>
                <span className="text-text-tertiary">/</span>
                <span className="text-danger/80 tabular-nums font-mono">-{part.deletions}</span>
                <span className="ml-1 font-mono text-text-tertiary break-all">{part.path}</span>
              </div>
            );

          case "task":
            return (
              <div
                key={key}
                className="flex items-center gap-1.5 text-[11px] border border-stroke-subtle px-2.5 py-1.5 bg-surface-1"
              >
                {part.status === "running" ? (
                  <span className="inline-flex animate-spin text-warning/80">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </span>
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
                <span className="text-text-secondary">{part.task}</span>
                {part.result != null && String(part.result).length > 0 ? (
                  <span className="ml-auto text-text-tertiary">{String(part.result)}</span>
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
