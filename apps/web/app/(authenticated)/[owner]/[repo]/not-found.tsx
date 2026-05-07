import Link from "next/link";

export default function RepoNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900/40 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-100">Repository not found</h2>
      <p className="mt-2 text-sm text-zinc-500">
        We could not load this repository. It may have been renamed, removed, or you may not have access.
      </p>
      <Link
        href="/repos"
        className="mt-6 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Back to repositories
      </Link>
    </div>
  );
}
