"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPullRequestAction } from "../actions";

export function NewPrForm({
  owner,
  repo,
  branches,
  defaultBranch,
}: {
  owner: string;
  repo: string;
  branches: string[];
  defaultBranch: string;
}) {
  const [head, setHead] = useState("");
  const [base, setBase] = useState(defaultBranch);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!head || !base || !title.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (head === base) {
      setError("Head and base branches must be different.");
      return;
    }

    startTransition(async () => {
      const result = await createPullRequestAction(
        owner,
        repo,
        title.trim(),
        body,
        head,
        base,
      );
      if (result.error) {
        setError(result.error);
      } else if (result.number) {
        router.push(`/${owner}/${repo}/pulls/${result.number}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Head branch <span className="text-danger">*</span>
          </label>
          <select
            value={head}
            onChange={(e) => setHead(e.target.value)}
            className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Select branch…</option>
            {branches
              .filter((b) => b !== base)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-text-tertiary">The branch with your changes</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Base branch <span className="text-danger">*</span>
          </label>
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-tertiary">The branch you want to merge into</p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Title <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What does this PR do?"
          className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Description
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Add a description of your changes…"
          className="w-full border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending && (
            <span className="inline-flex animate-spin">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </span>
          )}
          Create Pull Request
        </button>
      </div>
    </form>
  );
}
