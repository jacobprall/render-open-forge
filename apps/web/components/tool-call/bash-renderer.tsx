"use client";

import { Terminal } from "lucide-react";
import { ToolLayout, type ToolStatus } from "./tool-layout";

interface BashArgs {
  command?: string;
  cmd?: string;
}

interface BashResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  output?: string;
}

interface Props {
  args?: BashArgs;
  result?: BashResult;
  status?: ToolStatus;
}

export function BashRenderer({ args, result, status = "idle" }: Props) {
  const cmd = args?.command ?? args?.cmd ?? "";
  const output = result?.stdout ?? result?.output ?? "";
  const stderr = result?.stderr ?? "";
  const exitCode = result?.exitCode;

  const derivedStatus: ToolStatus =
    status === "running"
      ? "running"
      : result !== undefined
        ? exitCode === 0 || exitCode === undefined
          ? "success"
          : "error"
        : status;

  return (
    <ToolLayout
      icon={<Terminal className="size-3" />}
      title="bash"
      subtitle={cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd}
      status={derivedStatus}
    >
      {cmd && (
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap mb-2">
          <span className="text-zinc-500 select-none">$ </span>
          {cmd}
        </pre>
      )}
      {output && (
        <pre className="text-xs whitespace-pre-wrap text-zinc-100">{output}</pre>
      )}
      {stderr && (
        <pre className="text-xs whitespace-pre-wrap text-red-400 mt-1">
          {stderr}
        </pre>
      )}
      {exitCode !== undefined && exitCode !== 0 && (
        <div className="text-xs text-red-400 mt-1">Exit code: {exitCode}</div>
      )}
    </ToolLayout>
  );
}
