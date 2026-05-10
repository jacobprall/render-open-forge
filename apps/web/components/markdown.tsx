"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

function qualifiesAsLooseListRun(lines: string[]): boolean {
  if (lines.length < 3) return false;
  if (
    lines.some((l) =>
      /^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|\s*\|)/.test(l.trimStart()),
    )
  ) {
    return false;
  }
  if (lines.some((l) => l.length > 200)) return false;
  const sentenceLike = lines.filter((l) => {
    const t = l.trim();
    return t.length > 48 && /[.!?]["'']?$/.test(t);
  }).length;
  if (sentenceLike > lines.length * 0.35) return false;
  return true;
}

/**
 * Turn trailing “plain line” runs into GFM lists (see qualifiesAsLooseListRun).
 * Keeps earlier lines as normal prose so intro paragraphs are not bulleted.
 */
function coerceLooseListParagraphs(source: string): string {
  if (!source.includes("\n") || source.includes("```")) return source;

  const parts = source.split(/(\n{2,})/);
  const result: string[] = [];

  for (const segment of parts) {
    if (/^\n+$/.test(segment) || !segment.trim()) {
      result.push(segment);
      continue;
    }
    if (segment.includes("```")) {
      result.push(segment);
      continue;
    }

    const trimmed = segment.trim();
    const lines = trimmed.split("\n").map((l) => l.trimEnd());
    if (lines.length < 3) {
      result.push(segment);
      continue;
    }

    let bestStart = -1;
    for (let start = 0; start <= lines.length - 3; start++) {
      if (qualifiesAsLooseListRun(lines.slice(start))) bestStart = start;
    }

    if (bestStart >= 0) {
      const head = lines.slice(0, bestStart);
      const run = lines.slice(bestStart);
      const bullets = run.map((l) => `- ${l.trim()}`).join("\n");
      const merged = head.length > 0 ? `${head.join("\n")}\n\n${bullets}` : bullets;
      result.push(merged);
      continue;
    }

    result.push(segment);
  }

  return result.join("");
}

const markdownComponents: Components = {
  pre({ children: preChildren }) {
    return <>{preChildren}</>;
  },
  code({ className, children: codeChildren }) {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = String(codeChildren).replace(/\n$/, "");
    if (match) {
      return <CodeBlock code={codeString} language={match[1]} showLineNumbers={false} />;
    }
    return (
      <code className={className}>
        {codeChildren}
      </code>
    );
  },
};

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  const normalized = coerceLooseListParagraphs(children);

  return (
    <div
      className="prose prose-sm prose-invert max-w-none min-w-0 wrap-break-word
        text-[15px] leading-[1.7] text-text-secondary
        prose-p:my-1
        prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-medium prose-headings:text-text-primary prose-headings:tracking-tight
        prose-h1:text-base prose-h2:text-sm prose-h3:text-[13px]
        prose-ul:my-2 prose-ol:my-2 prose-ul:pl-0 prose-ol:pl-0
        prose-li:my-0.5 prose-li:pl-1
        prose-ul:list-inside prose-ol:list-inside
        prose-li:marker:text-accent-text/70 prose-ol:marker:text-accent-text/70
        prose-strong:text-text-primary prose-strong:font-medium
        prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0
        prose-code:before:content-none prose-code:after:content-none
        prose-code:bg-surface-2 prose-code:px-1 prose-code:py-px prose-code:text-[12px] prose-code:font-normal prose-code:text-text-secondary prose-code:break-all
        prose-a:text-accent-text/90 prose-a:no-underline hover:prose-a:underline prose-a:break-all prose-a:font-normal
        prose-blockquote:border-l-2 prose-blockquote:border-stroke-subtle prose-blockquote:text-text-tertiary prose-blockquote:not-italic prose-blockquote:my-2
        prose-table:text-xs prose-th:px-2 sm:prose-th:px-3 prose-th:py-1 prose-td:px-2 sm:prose-td:px-3 prose-td:py-1
        [&_table]:block [&_table]:overflow-x-auto [&_table]:w-full
        prose-hr:my-3 prose-hr:border-stroke-subtle
        prose-img:max-w-full prose-img:h-auto"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={markdownComponents}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
