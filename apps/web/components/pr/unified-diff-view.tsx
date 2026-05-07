"use client";

import { highlightLine, detectLangFromDiff } from "@/components/diff/syntax-highlight";

export function UnifiedDiffView({ raw, className = "" }: { raw: string; className?: string }) {
  const lines = raw.split("\n");
  const lang = detectLangFromDiff(raw);

  return (
    <pre
      className={`overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed ${className}`}
    >
      {lines.map((line, i) => {
        let cls = "text-zinc-300";
        const isAdd = line.startsWith("+") && !line.startsWith("+++");
        const isRm = line.startsWith("-") && !line.startsWith("---");
        if (line.startsWith("@@")) cls = "text-cyan-400";
        else if (isAdd) cls = "border-l-2 border-accent/60 bg-accent-bg pl-2 text-accent";
        else if (isRm) cls = "border-l-2 border-red-500/60 bg-red-500/10 pl-2 text-red-300";
        else if (line.startsWith("diff ") || line.startsWith("Binary files")) cls = "text-zinc-500";

        const isCode = isAdd || isRm || (!line.startsWith("@@") && !line.startsWith("diff ") && !line.startsWith("Binary files") && !line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("index "));

        const content = isCode && lang ? highlightLine(line, lang) : line;

        return (
          <span key={i} className={`block whitespace-pre-wrap font-mono ${cls}`}>
            {content}
          </span>
        );
      })}
    </pre>
  );
}
