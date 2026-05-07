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
        className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
      >
        Delete repository
      </button>
    );
  }

  return (
    <div className="shrink-0 space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <p className="text-xs text-zinc-400">
        Type <span className="font-mono font-semibold text-zinc-200">{expectedText}</span> to confirm:
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={expectedText}
        className="w-full rounded-lg border border-red-500/30 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 transition focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={isPending || confirmText !== expectedText}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "I understand, delete"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setConfirmText("");
            setError(null);
          }}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
