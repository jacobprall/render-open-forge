"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { Send } from "lucide-react";
import { RepoBranchPicker } from "./repo-branch-picker";
import { ModelSelector } from "@/components/model-selector";
import { DEFAULT_MODEL_ID } from "@/lib/model-defaults";

interface NewSessionInputProps {
  defaultModelId?: string;
  defaultRepo?: string;
  defaultBranch?: string;
  projectId?: string;
  onSessionCreated?: (session: { id: string; firstMessage: string; modelId: string }) => void;
}

export function NewSessionInput({ defaultModelId, defaultRepo, defaultBranch, projectId, onSessionCreated }: NewSessionInputProps) {
  const [message, setMessage] = useState("");
  const [repoBranch, setRepoBranch] = useState<{ repo: string; branch: string } | null>(
    defaultRepo ? { repo: defaultRepo, branch: defaultBranch ?? "main" } : null,
  );
  const [modelId, setModelId] = useState(defaultModelId || DEFAULT_MODEL_ID);
  const [loading, startLoading] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = message.trim() && !loading;

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canSubmit) return;

      setError(null);
      startLoading(async () => {
        try {
          const body: Record<string, string> = {
            firstMessage: message.trim(),
            modelId,
          };
          if (repoBranch) {
            body.repoPath = repoBranch.repo;
            body.baseBranch = repoBranch.branch;
          }
          if (projectId) {
            body.projectId = projectId;
          }

          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `Failed to create session (${res.status})`);
          }

          const data = await res.json();
          onSessionCreated?.({ id: data.id, firstMessage: message.trim(), modelId });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      });
    },
    [canSubmit, repoBranch, message, modelId, projectId, onSessionCreated],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="border border-stroke-default bg-surface-1 transition-colors duration-(--of-duration-instant) focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/25">
        <div className="flex flex-col gap-2 border-b border-stroke-subtle px-(--of-space-md) py-(--of-space-sm) sm:flex-row sm:items-center">
          <RepoBranchPicker value={repoBranch} onChange={setRepoBranch} />
          <ModelSelector value={modelId} onChange={setModelId} compact />
        </div>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to build…"
          rows={3}
          className="w-full resize-none bg-transparent px-(--of-space-md) py-(--of-space-sm) text-[15px] leading-relaxed text-text-primary placeholder-text-tertiary outline-none"
          disabled={loading}
        />

        <div className="flex items-center justify-end border-t border-stroke-subtle px-(--of-space-md) py-(--of-space-sm)">
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
