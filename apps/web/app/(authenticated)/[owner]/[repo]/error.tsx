"use client";

import Link from "next/link";

export default function RepoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/40 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-100">Something went wrong</h2>
      <p className="mt-2 text-sm text-zinc-500">{error.message || "This repository page failed to load."}</p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Try again
        </button>
        <Link
          href="/repos"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          All repositories
        </Link>
      </div>
    </div>
  );
}
