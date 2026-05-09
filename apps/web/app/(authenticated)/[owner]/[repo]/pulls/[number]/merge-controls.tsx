"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { mergePullRequestAction } from "../actions";

function parseMergeBlockReason(errorMsg: string): string {
  const lower = errorMsg.toLowerCase();
  if (lower.includes("405") || lower.includes("not allowed")) {
    return "Merge is blocked — branch protection rules or required approvals are not met.";
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "You do not have permission to merge this pull request.";
  }
  if (lower.includes("409") || lower.includes("conflict")) {
    return "There are merge conflicts that must be resolved first.";
  }
  if (lower.includes("required status") || lower.includes("ci") || lower.includes("check")) {
    return "Required CI status checks have not passed yet.";
  }
  if (lower.includes("review") || lower.includes("approval")) {
    return "Required reviewer approvals are missing.";
  }
  return errorMsg;
}

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

  const protectionUrl = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branch-protection`;
  const { data: protectionData } = useSWR(
    protectionUrl,
    async (url) => {
      const r = await fetch(url, { cache: "no-store" });
      return r.json() as Promise<{ protections?: unknown[] }>;
    },
    { revalidateOnFocus: true },
  );
  const branchProtected =
    protectionData !== undefined
      ? Array.isArray(protectionData.protections) && protectionData.protections.length > 0
      : null;

  function handleMerge() {
    setError(null);
    startTransition(async () => {
      const result = await mergePullRequestAction(owner, repo, number, method);
      if (result.error) {
        setError(parseMergeBlockReason(result.error));
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
    <div className="border border-stroke-subtle bg-surface-1 p-5">
      <h3 className="mb-4 text-sm font-medium text-text-secondary">Merge Pull Request</h3>

      {branchProtected && (
        <div className="mb-4 flex items-start gap-2 border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-warning">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>
            Branch protection is enabled. Merging requires passing CI checks and/or reviewer approvals configured in the repo settings.
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={handleMerge}
            disabled={isPending}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending ? (
              <span className="inline-flex animate-spin">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </span>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218Z" />
              </svg>
            )}
            {methodLabels[method]}
          </button>
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="border-l border-accent bg-accent px-2.5 py-2 text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-full z-10 mt-1 w-56 border border-stroke-default bg-surface-2 py-1 shadow-xl">
              {(["merge", "squash", "rebase"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMethod(m);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors duration-(--of-duration-instant) hover:bg-surface-3 ${
                    method === m ? "text-accent-text" : "text-text-secondary"
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
