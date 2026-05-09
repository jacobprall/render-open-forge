"use client";

import { useMemo } from "react";
import { FileEdit } from "lucide-react";

interface InlineDiffProps {
  filePath?: string;
  oldString: string;
  newString: string;
  maxLines?: number;
}

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

function computeUnifiedDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const result: DiffLine[] = [];

  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const reversed: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversed.push({ type: "context", content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({ type: "add", content: newLines[j - 1] });
      j--;
    } else {
      reversed.push({ type: "remove", content: oldLines[i - 1] });
      i--;
    }
  }

  reversed.reverse();

  const contextWindow = 3;
  let lastShown = -1;
  const changeBounds: [number, number][] = [];

  for (let idx = 0; idx < reversed.length; idx++) {
    if (reversed[idx].type !== "context") {
      const start = Math.max(0, idx - contextWindow);
      const end = Math.min(reversed.length - 1, idx + contextWindow);
      if (changeBounds.length > 0 && start <= changeBounds[changeBounds.length - 1][1] + 1) {
        changeBounds[changeBounds.length - 1][1] = end;
      } else {
        changeBounds.push([start, end]);
      }
    }
  }

  for (const [start, end] of changeBounds) {
    if (start > lastShown + 1) {
      result.push({ type: "context", content: "···" });
    }
    for (let idx = start; idx <= end; idx++) {
      result.push(reversed[idx]);
    }
    lastShown = end;
  }

  if (lastShown < reversed.length - 1) {
    result.push({ type: "context", content: "···" });
  }

  return result;
}

export function InlineDiffView({ filePath, oldString, newString, maxLines = 200 }: InlineDiffProps) {
  const lines = useMemo(() => {
    const all = computeUnifiedDiff(oldString, newString);
    return all.slice(0, maxLines);
  }, [oldString, newString, maxLines]);

  const additions = lines.filter((l) => l.type === "add").length;
  const deletions = lines.filter((l) => l.type === "remove").length;

  return (
    <div className="border border-stroke-subtle bg-surface-1 overflow-hidden text-[13px] font-mono">
      <div className="flex items-center justify-between px-(--of-space-md) py-(--of-space-xs) border-b border-stroke-subtle">
        <div className="flex items-center gap-(--of-space-xs) min-w-0">
          <FileEdit className="h-3 w-3 shrink-0 text-text-tertiary" />
          {filePath && (
            <span className="text-[11px] text-text-tertiary truncate">{filePath}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0">
          <span className="text-success">+{additions}</span>
          <span className="text-danger">-{deletions}</span>
        </div>
      </div>
      <div className="overflow-auto max-h-96">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === "add"
                    ? "bg-success/10"
                    : line.type === "remove"
                      ? "bg-danger/10"
                      : ""
                }
              >
                <td className="w-4 px-2 text-right select-none text-text-tertiary align-top">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </td>
                <td className="px-(--of-space-sm) py-px whitespace-pre-wrap break-all">
                  <span
                    className={
                      line.type === "add"
                        ? "text-success"
                        : line.type === "remove"
                          ? "text-danger"
                          : "text-text-secondary"
                    }
                  >
                    {line.content}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
