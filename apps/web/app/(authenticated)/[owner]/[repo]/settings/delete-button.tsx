"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRepoAction } from "./actions";

export function DeleteRepoButton({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const expectedText = `${owner}/${repo}`;

  function handleDelete() {
    if (confirmText !== expectedText) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteRepoAction(owner, repo);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/repos");
      }
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-danger transition-colors duration-(--of-duration-instant) hover:bg-red-500/20"
      >
        Delete repository
      </button>
    );
  }

  return (
    <div className="shrink-0 space-y-3">
      {error && (
        <div className="border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <p className="text-xs text-text-tertiary">
        Type <span className="font-mono font-semibold text-text-primary">{expectedText}</span> to confirm:
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={expectedText}
        className="w-full border border-red-500/30 bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary transition-colors duration-(--of-duration-instant) focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={isPending || confirmText !== expectedText}
          className="bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-red-500 disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "I understand, delete"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setConfirmText("");
            setError(null);
          }}
          className="border border-stroke-default px-4 py-2 text-sm font-medium text-text-tertiary transition-colors duration-(--of-duration-instant) hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
