import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createForgeProvider } from "@/lib/forgejo/client";
import Link from "next/link";
import { Suspense } from "react";
import { RepoSearch } from "./search";
import type { ForgeRepo } from "@render-open-forge/shared/lib/forge/types";

function VisibilityBadge({ isPrivate }: { isPrivate: boolean }) {
  if (isPrivate) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
        Private
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
      Public
    </span>
  );
}

function RepoCard({ repo }: { repo: ForgeRepo }) {
  return (
    <Link
      href={`/${repo.fullName}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
              />
            </svg>
            <h3 className="truncate font-semibold text-zinc-100 group-hover:text-emerald-400">
              {repo.fullName}
            </h3>
          </div>
          {repo.description && (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
              {repo.description}
            </p>
          )}
        </div>
        <VisibilityBadge isPrivate={repo.isPrivate} />
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
          {repo.defaultBranch}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
          <svg
            className="h-6 w-6 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-zinc-300">
          No matching repositories
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Try adjusting your search query or clear the filter.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-zinc-300">
        No repositories yet
      </h3>
      <p className="mt-1 text-sm text-zinc-500">
        Create your first repository to start hosting code.
      </p>
      <Link
        href="/repos/new"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        New Repository
      </Link>
    </div>
  );
}

export default async function ReposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const forge = createForgeProvider(session.forgejoToken);
  const repos = await forge.repos.list().catch(() => [] as ForgeRepo[]);

  const { q } = await searchParams;
  const query = q?.toLowerCase() ?? "";
  const filtered = query
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.fullName.toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query),
      )
    : repos;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {repos.length} {repos.length === 1 ? "repository" : "repositories"}{" "}
            total
          </p>
        </div>
        <Link
          href="/repos/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Repository
        </Link>
      </div>

      {/* Search */}
      {repos.length > 0 && (
        <div className="mb-6">
          <Suspense>
            <RepoSearch />
          </Suspense>
        </div>
      )}

      {/* Repo List */}
      {filtered.length === 0 ? (
        <EmptyState hasSearch={!!query} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </div>
  );
}
