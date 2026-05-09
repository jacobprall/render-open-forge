"use client";

import { Globe, Zap } from "lucide-react";
import { ToolLayout } from "./tool-layout";
import { BashRenderer } from "./bash-renderer";
import { ReadRenderer, WriteRenderer, EditRenderer } from "./read-write-renderer";
import { GlobRenderer, GrepRenderer } from "./glob-grep-renderer";
import { GitRenderer } from "./git-renderer";
import type { ToolStatus } from "./tool-layout";

interface ToolCallProps {
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: ToolStatus;
}

export function ToolCall({ toolName, args, result, status }: ToolCallProps) {
  switch (toolName) {
    case "bash":
      return (
        <BashRenderer
          args={args as Parameters<typeof BashRenderer>[0]["args"]}
          result={result as Parameters<typeof BashRenderer>[0]["result"]}
          status={status}
        />
      );

    case "read_file":
    case "read":
      return (
        <ReadRenderer
          args={args as Parameters<typeof ReadRenderer>[0]["args"]}
          result={result as Parameters<typeof ReadRenderer>[0]["result"]}
          status={status}
        />
      );

    case "write_file":
    case "write":
      return (
        <WriteRenderer
          args={args as Parameters<typeof WriteRenderer>[0]["args"]}
          result={result as Parameters<typeof WriteRenderer>[0]["result"]}
          status={status}
        />
      );

    case "edit":
    case "edit_file":
      return (
        <EditRenderer
          args={args as Parameters<typeof EditRenderer>[0]["args"]}
          result={result as Parameters<typeof EditRenderer>[0]["result"]}
          status={status}
        />
      );

    case "glob":
      return (
        <GlobRenderer
          args={args as Parameters<typeof GlobRenderer>[0]["args"]}
          result={result as Parameters<typeof GlobRenderer>[0]["result"]}
          status={status}
        />
      );

    case "grep":
      return (
        <GrepRenderer
          args={args as Parameters<typeof GrepRenderer>[0]["args"]}
          result={result as Parameters<typeof GrepRenderer>[0]["result"]}
          status={status}
        />
      );

    case "git":
      return (
        <GitRenderer
          args={args as Parameters<typeof GitRenderer>[0]["args"]}
          result={result as Parameters<typeof GitRenderer>[0]["result"]}
          status={status}
        />
      );

    case "web_fetch":
      return (
        <ToolLayout
          icon={<Globe className="size-3" />}
          title="web_fetch"
          subtitle={(args?.url as string | undefined) ?? ""}
          status={status ?? (result !== undefined ? "success" : "idle")}
        >
          {result != null && (
            <pre className="text-xs whitespace-pre-wrap text-text-secondary">
              {typeof result === "object"
                ? (result as Record<string, unknown>).body
                  ? String((result as Record<string, unknown>).body).slice(0, 1000)
                  : JSON.stringify(result, null, 2).slice(0, 1000)
                : String(result as string | number | boolean).slice(0, 1000)}
            </pre>
          )}
        </ToolLayout>
      );

    default:
      return (
        <ToolLayout
          icon={<Zap className="size-3" />}
          title={toolName}
          status={status ?? (result !== undefined ? "success" : "idle")}
        >
          {args && (
            <pre className="text-xs whitespace-pre-wrap text-text-secondary">
              {JSON.stringify(args, null, 2).slice(0, 800)}
            </pre>
          )}
          {result != null && (
            <pre className="text-xs whitespace-pre-wrap text-text-secondary mt-2">
              {JSON.stringify(result, null, 2).slice(0, 800)}
            </pre>
          )}
        </ToolLayout>
      );
  }
}

export type { ToolStatus };
