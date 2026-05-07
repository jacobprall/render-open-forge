"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  return (
    <div
      className="prose prose-sm prose-invert max-w-none wrap-break-word overflow-hidden
        text-[13px] leading-[1.7] text-zinc-300
        prose-p:my-1
        prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-medium prose-headings:text-zinc-200 prose-headings:tracking-tight
        prose-h1:text-base prose-h2:text-sm prose-h3:text-[13px]
        prose-ul:my-1 prose-ol:my-1
        prose-li:my-0
        prose-li:marker:text-zinc-600
        prose-strong:text-zinc-200 prose-strong:font-medium
        prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-md prose-pre:text-xs prose-pre:overflow-x-auto prose-pre:my-2
        prose-code:before:content-none prose-code:after:content-none
        prose-code:bg-zinc-800/70 prose-code:px-1 prose-code:py-px prose-code:rounded prose-code:text-[11px] prose-code:font-normal prose-code:text-zinc-300 prose-code:break-all
        prose-a:text-emerald-400/90 prose-a:no-underline hover:prose-a:underline prose-a:break-all prose-a:font-normal
        prose-blockquote:border-l-2 prose-blockquote:border-zinc-700 prose-blockquote:text-zinc-500 prose-blockquote:not-italic prose-blockquote:my-2
        prose-table:text-xs prose-th:px-2 sm:prose-th:px-3 prose-th:py-1 prose-td:px-2 sm:prose-td:px-3 prose-td:py-1
        [&_table]:block [&_table]:overflow-x-auto [&_table]:w-full
        prose-hr:my-3 prose-hr:border-zinc-800
        prose-img:max-w-full prose-img:h-auto"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
