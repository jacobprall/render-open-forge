import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createForgeProvider } from "@/lib/forgejo/client";
import Link from "next/link";
import { Suspense } from "react";
import { RepoSearch } from "./search";
import type { ForgeRepo } from "@openforge/platform/forge/types";
import {
  PageShell,
  StatusBadge,
  EmptyState,
  Button,
} from "@/components/primitives";
import { FolderOpen, GitBranch, Plus, Search } from "lucide-react";

export const metadata: Metadata = { title: "Repositories" };

function RepoCard({ repo }: { repo: ForgeRepo }) {
  return (
    <Link
      href={`/${repo.fullName}`}
      className="group block rounded-xl border border-stroke-default bg-surface-1 p-5 transition hover:border-stroke-subtle hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-text-tertiary" />
            <h3 className="truncate font-semibold text-text-primary group-hover:text-accent-text">
              {repo.fullName}
            </h3>
          </div>
          {repo.description && (
            <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
              {repo.description}
            </p>
          )}
        </div>
        <StatusBadge status={repo.isPrivate ? "private" : "public"} />
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" />
          {repo.defaultBranch}
        </span>
      </div>
    </Link>
  );
}

export default async function ReposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [session, { q }] = await Promise.all([getSession(), searchParams]);
  if (!session) redirect("/");

  const forge = createForgeProvider(session.forgeToken, session.forgeType);
  const repos = await forge.repos.list().catch(() => [] as ForgeRepo[]);

  const query = q?.toLowerCase() ?? "";
  const filtered = query
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.fullName.toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query),
      )
    : repos;

  const description = query
    ? `Showing ${filtered.length} of ${repos.length} repositories`
    : `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`;

  return (
    <PageShell
      title="Repositories"
      description={description}
      className="mx-auto max-w-5xl"
      actions={
        <Button variant="primary" asChild>
          <Link href="/repos/new">
            <Plus className="h-4 w-4" />
            New Repository
          </Link>
        </Button>
      }
    >
      {repos.length > 0 && (
        <div className="mb-6">
          <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-surface-2" />}>
            <RepoSearch />
          </Suspense>
        </div>
      )}

      {filtered.length === 0 ? (
        query ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No matching repositories"
            description="Try adjusting your search query or clear the filter."
          />
        ) : (
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" />}
            title="No repositories yet"
            description="Create your first repository to start hosting code."
            action={
              <Button variant="primary" asChild>
                <Link href="/repos/new">
                  <Plus className="h-4 w-4" />
                  New Repository
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
