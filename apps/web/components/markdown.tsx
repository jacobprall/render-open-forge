"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  return (
    <div
      className="prose prose-sm prose-invert max-w-none break-words leading-relaxed overflow-hidden
        prose-p:my-1.5
        prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
        prose-ul:my-1.5 prose-ol:my-1.5
        prose-li:my-0.5
        prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-lg prose-pre:text-sm prose-pre:overflow-x-auto
        prose-code:before:content-none prose-code:after:content-none
        prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-code:break-all
        prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline prose-a:break-all
        prose-blockquote:border-l-2 prose-blockquote:border-zinc-600 prose-blockquote:text-zinc-400
        prose-table:text-sm prose-th:px-2 sm:prose-th:px-3 prose-th:py-1.5 prose-td:px-2 sm:prose-td:px-3 prose-td:py-1.5
        [&_table]:block [&_table]:overflow-x-auto [&_table]:w-full
        prose-hr:my-4
        prose-img:max-w-full prose-img:h-auto"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
