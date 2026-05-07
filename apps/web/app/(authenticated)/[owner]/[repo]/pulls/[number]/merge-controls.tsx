"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergePullRequestAction } from "../actions";

export function MergeControls({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: number;
}) {
  const [method, setMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleMerge() {
    setError(null);
    startTransition(async () => {
      const result = await mergePullRequestAction(owner, repo, number, method);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const methodLabels = {
    merge: "Create a merge commit",
    squash: "Squash and merge",
    rebase: "Rebase and merge",
  } as const;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-4 text-sm font-medium text-zinc-300">Merge Pull Request</h3>
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={handleMerge}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-l-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isPending ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218Z" />
              </svg>
            )}
            {methodLabels[method]}
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="rounded-r-lg border-l border-emerald-700 bg-emerald-600 px-2.5 py-2 text-white transition hover:bg-emerald-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
              {(["merge", "squash", "rebase"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMethod(m);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition hover:bg-zinc-700 ${
                    method === m ? "text-emerald-400" : "text-zinc-300"
                  }`}
                >
                  {method === m && (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  <span className={method === m ? "" : "pl-5.5"}>{methodLabels[m]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
