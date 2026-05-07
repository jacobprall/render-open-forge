"use client";

import { FileText, FilePen, FileEdit } from "lucide-react";
import { ToolLayout, type ToolStatus } from "./tool-layout";

interface ReadArgs {
  path?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

interface ReadResult {
  content?: string;
  lines?: number;
  error?: string;
}

interface WriteArgs {
  path?: string;
  filePath?: string;
  content?: string;
}

interface WriteResult {
  success?: boolean;
  bytesWritten?: number;
  error?: string;
}

interface EditArgs {
  path?: string;
  filePath?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
}

interface EditResult {
  success?: boolean;
  replacements?: number;
  error?: string;
}

export function ReadRenderer({
  args,
  result,
  status = "idle",
}: {
  args?: ReadArgs;
  result?: ReadResult;
  status?: ToolStatus;
}) {
  const filePath = args?.path ?? args?.filePath ?? "";
  const lineInfo =
    args?.startLine != null
      ? ` (lines ${args.startLine}–${args.endLine ?? "end"})`
      : "";
  const derivedStatus: ToolStatus = result?.error
    ? "error"
    : result?.content !== undefined
      ? "success"
      : status;

  return (
    <ToolLayout
      icon={<FileText className="size-3" />}
      title="read"
      subtitle={filePath + lineInfo}
      status={derivedStatus}
    >
      {result?.error ? (
        <span className="text-red-400">{result.error}</span>
      ) : result?.content != null ? (
        <pre className="text-xs whitespace-pre-wrap text-zinc-300">
          {result.content}
        </pre>
      ) : null}
    </ToolLayout>
  );
}

export function WriteRenderer({
  args,
  result,
  status = "idle",
}: {
  args?: WriteArgs;
  result?: WriteResult;
  status?: ToolStatus;
}) {
  const filePath = args?.path ?? args?.filePath ?? "";
  const derivedStatus: ToolStatus = result?.error
    ? "error"
    : result?.success
      ? "success"
      : status;

  return (
    <ToolLayout
      icon={<FilePen className="size-3" />}
      title="write"
      subtitle={filePath}
      status={derivedStatus}
    >
      {result?.error && <span className="text-red-400">{result.error}</span>}
      {result?.bytesWritten != null && (
        <span className="text-zinc-400">
          {result.bytesWritten} bytes written
        </span>
      )}
      {args?.content && (
        <pre className="text-xs whitespace-pre-wrap text-zinc-300 mt-1">
          {args.content.length > 800
            ? args.content.slice(0, 800) + "\n…"
            : args.content}
        </pre>
      )}
    </ToolLayout>
  );
}

export function EditRenderer({
  args,
  result,
  status = "idle",
}: {
  args?: EditArgs;
  result?: EditResult;
  status?: ToolStatus;
}) {
  const filePath = args?.path ?? args?.filePath ?? "";
  const derivedStatus: ToolStatus = result?.error
    ? "error"
    : result?.success
      ? "success"
      : status;

  return (
    <ToolLayout
      icon={<FileEdit className="size-3" />}
      title="edit"
      subtitle={filePath}
      status={derivedStatus}
    >
      {result?.error && <span className="text-red-400">{result.error}</span>}
      {result?.replacements != null && (
        <span className="text-zinc-400">
          {result.replacements} replacement
          {result.replacements !== 1 ? "s" : ""}
        </span>
      )}
      {args?.oldString && (
        <div className="mt-1 space-y-1">
          <pre className="text-xs bg-red-500/10 text-red-400 whitespace-pre-wrap px-1 rounded">
            {`- ${args.oldString.length > 400 ? args.oldString.slice(0, 400) + "…" : args.oldString}`}
          </pre>
          <pre className="text-xs bg-emerald-500/10 text-emerald-400 whitespace-pre-wrap px-1 rounded">
            {`+ ${args.newString ? (args.newString.length > 400 ? args.newString.slice(0, 400) + "…" : args.newString) : ""}`}
          </pre>
        </div>
      )}
    </ToolLayout>
  );
}
