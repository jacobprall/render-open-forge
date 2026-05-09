"use client";

import { FileText, FilePen, FileEdit } from "lucide-react";
import { ToolLayout, type ToolStatus } from "./tool-layout";
import { CodeBlock } from "@/components/code-block";
import { InlineDiffView } from "./inline-diff";

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
        <span className="text-danger">{result.error}</span>
      ) : result?.content != null ? (
        <CodeBlock
          code={result.content}
          filePath={filePath}
          showLineNumbers={false}
          maxHeight="max-h-64"
        />
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
      {result?.error && <span className="text-danger">{result.error}</span>}
      {result?.bytesWritten != null && (
        <span className="text-text-tertiary">
          {result.bytesWritten} bytes written
        </span>
      )}
      {args?.content && (
        <CodeBlock
          code={args.content.length > 800 ? args.content.slice(0, 800) + "\n…" : args.content}
          filePath={filePath}
          showLineNumbers={false}
          maxHeight="max-h-48"
        />
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
      defaultOpen
    >
      {result?.error && <span className="text-danger">{result.error}</span>}
      {result?.replacements != null && (
        <span className="text-text-tertiary">
          {result.replacements} replacement
          {result.replacements !== 1 ? "s" : ""}
        </span>
      )}
      {args?.oldString && args?.newString != null ? (
        <InlineDiffView
          filePath={filePath}
          oldString={args.oldString.length > 800 ? args.oldString.slice(0, 800) + "…" : args.oldString}
          newString={args.newString.length > 800 ? args.newString.slice(0, 800) + "…" : args.newString}
        />
      ) : args?.oldString ? (
        <div className="space-y-1">
          <pre className="text-xs bg-danger/10 text-danger whitespace-pre-wrap px-1">
            {`- ${args.oldString.length > 400 ? args.oldString.slice(0, 400) + "…" : args.oldString}`}
          </pre>
          <pre className="text-xs bg-accent-bg text-accent-text whitespace-pre-wrap px-1">
            {`+ ${args.newString ? (args.newString.length > 400 ? args.newString.slice(0, 400) + "…" : args.newString) : ""}`}
          </pre>
        </div>
      ) : null}
    </ToolLayout>
  );
}
