"use client";

import { useRef, useState } from "react";

interface ChatInputProps {
  isStreaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}

export function ChatInput({ isStreaming, onSend, onStop }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() || isStreaming) return;
      onSend(input);
      setInput("");
    }
  }

  return (
    <div className="shrink-0 border-t border-zinc-800 px-4 py-3">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 transition focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/25">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the agent…"
            rows={1}
            className="max-h-36 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-600"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
