"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { RepoBranchPicker } from "./repo-branch-picker";
import { ModelSelector } from "@/components/model-selector";
import { DEFAULT_MODEL_ID } from "@/lib/model-defaults";

interface NewSessionInputProps {
  defaultModelId?: string;
}

export function NewSessionInput({ defaultModelId }: NewSessionInputProps) {
  const [message, setMessage] = useState("");
  const [repoBranch, setRepoBranch] = useState<{ repo: string; branch: string } | null>(null);
  const [modelId, setModelId] = useState(defaultModelId || DEFAULT_MODEL_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const canSubmit = message.trim() && repoBranch && !loading;

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit || !repoBranch) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoPath: repoBranch.repo,
            baseBranch: repoBranch.branch,
            firstMessage: message.trim(),
            modelId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to create session (${res.status})`);
        }

        const data = await res.json();
        router.push(`/sessions/${data.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setLoading(false);
      }
    },
    [canSubmit, repoBranch, message, modelId, router],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col border border-stroke-default bg-surface-1 transition-colors duration-(--of-duration-instant) focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/25">
        {/* Main text area -- takes up most of the space */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to build?"
          className="min-h-0 flex-1 resize-none bg-transparent px-(--of-space-md) py-(--of-space-md) text-[15px] leading-relaxed text-text-primary placeholder-text-tertiary outline-none"
          disabled={loading}
        />

        {/* Bottom bar -- repo/branch, model, send */}
        <div className="flex items-center justify-between gap-3 border-t border-stroke-subtle px-(--of-space-md) py-(--of-space-sm)">
          <div className="flex items-center gap-2">
            <RepoBranchPicker value={repoBranch} onChange={setRepoBranch} />
            <ModelSelector value={modelId} onChange={setModelId} compact />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-1.5 bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-flex animate-spin">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
                Starting…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Start
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-[13px] text-danger">{error}</p>
      )}
    </form>
  );
}
