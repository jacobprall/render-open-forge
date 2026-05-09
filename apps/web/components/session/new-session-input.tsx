"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RepoBranchPicker } from "./repo-branch-picker";

interface NewSessionInputProps {
  defaultModelId?: string;
}

export function NewSessionInput({ defaultModelId }: NewSessionInputProps) {
  const [message, setMessage] = useState("");
  const [repoBranch, setRepoBranch] = useState<{ repo: string; branch: string } | null>(null);
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
            modelId: defaultModelId,
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
    [canSubmit, repoBranch, message, defaultModelId, router],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="border border-stroke-default bg-surface-1 transition-colors duration-(--of-duration-instant) focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/25">
        <div className="px-(--of-space-md) pt-(--of-space-sm)">
          <RepoBranchPicker value={repoBranch} onChange={setRepoBranch} />
        </div>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to build?"
          rows={3}
          className="w-full resize-none bg-transparent px-(--of-space-md) py-(--of-space-sm) text-[15px] text-text-primary placeholder-text-tertiary outline-none"
          disabled={loading}
        />
        <div className="flex items-center justify-between px-(--of-space-md) pb-(--of-space-sm)">
          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : (
            <span className="text-[11px] text-text-tertiary">
              {repoBranch ? "" : "Select a repository to get started"}
            </span>
          )}
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
                Creating…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                Start session
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
