"use client";

import type { ReactNode } from "react";
import { highlightLine, detectLangFromDiff } from "@/components/diff/syntax-highlight";

interface DiffLine {
  type: "context" | "addition" | "removal" | "header";
  leftNum?: number;
  rightNum?: number;
  leftContent?: string;
  rightContent?: string;
}

function parseDiff(diffText: string): DiffLine[] {
  const lines = diffText.split("\n");
  const result: DiffLine[] = [];
  let leftNum = 0;
  let rightNum = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        leftNum = parseInt(match[1]!, 10) - 1;
        rightNum = parseInt(match[2]!, 10) - 1;
      }
      result.push({ type: "header", leftContent: line, rightContent: line });
      continue;
    }

    if (line.startsWith("---") || line.startsWith("+++")) continue;
    if (line.startsWith("diff ")) continue;
    if (line.startsWith("index ")) continue;

    if (line.startsWith("-")) {
      leftNum++;
      result.push({
        type: "removal",
        leftNum,
        leftContent: line.slice(1),
      });
    } else if (line.startsWith("+")) {
      rightNum++;
      result.push({
        type: "addition",
        rightNum,
        rightContent: line.slice(1),
      });
    } else {
      leftNum++;
      rightNum++;
      const content = line.startsWith(" ") ? line.slice(1) : line;
      result.push({
        type: "context",
        leftNum,
        rightNum,
        leftContent: content,
        rightContent: content,
      });
    }
  }

  const paired: DiffLine[] = [];
  let i = 0;
  while (i < result.length) {
    if (result[i]!.type === "removal") {
      const removals: DiffLine[] = [];
      while (i < result.length && result[i]!.type === "removal") {
        removals.push(result[i]!);
        i++;
      }
      const additions: DiffLine[] = [];
      while (i < result.length && result[i]!.type === "addition") {
        additions.push(result[i]!);
        i++;
      }
      const max = Math.max(removals.length, additions.length);
      for (let j = 0; j < max; j++) {
        paired.push({
          type: removals[j] && additions[j] ? "context" : removals[j] ? "removal" : "addition",
          leftNum: removals[j]?.leftNum,
          rightNum: additions[j]?.rightNum,
          leftContent: removals[j]?.leftContent ?? "",
          rightContent: additions[j]?.rightContent ?? "",
        });
      }
    } else {
      paired.push(result[i]!);
      i++;
    }
  }

  return paired;
}

function renderContent(text: string | undefined, lang: string): ReactNode {
  if (text === undefined) return "";
  if (!lang) return text;
  return highlightLine(text, lang);
}

interface SideBySideDiffProps {
  diffText: string;
}

export function SideBySideDiff({ diffText }: SideBySideDiffProps) {
  const lines = parseDiff(diffText);
  const lang = detectLangFromDiff(diffText);

  if (!diffText.trim()) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
        No changes
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950">
      <table className="w-full table-fixed border-collapse font-mono text-xs">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-10" />
          <col />
        </colgroup>
        <tbody>
          {lines.map((line, idx) => {
            if (line.type === "header") {
              return (
                <tr key={idx} className="bg-zinc-900">
                  <td
                    colSpan={4}
                    className="px-2 py-1 text-xs text-zinc-500"
                  >
                    {line.leftContent}
                  </td>
                </tr>
              );
            }

            const leftBg =
              line.leftContent !== undefined && line.rightContent === ""
                ? "bg-red-950/40"
                : line.leftContent !== line.rightContent && line.leftContent
                  ? "bg-red-950/20"
                  : "";
            const rightBg =
              line.rightContent !== undefined && line.leftContent === ""
                ? "bg-green-950/40"
                : line.rightContent !== line.leftContent && line.rightContent
                  ? "bg-green-950/20"
                  : "";

            return (
              <tr key={idx} className="border-t border-zinc-900">
                <td className="select-none px-2 py-0.5 text-right text-zinc-600">
                  {line.leftNum || ""}
                </td>
                <td
                  className={`whitespace-pre-wrap break-all px-2 py-0.5 text-zinc-300 ${leftBg}`}
                >
                  {renderContent(line.leftContent, lang)}
                </td>
                <td className="select-none border-l border-zinc-800 px-2 py-0.5 text-right text-zinc-600">
                  {line.rightNum || ""}
                </td>
                <td
                  className={`whitespace-pre-wrap break-all px-2 py-0.5 text-zinc-300 ${rightBg}`}
                >
                  {renderContent(line.rightContent, lang)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
