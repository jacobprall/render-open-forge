import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getForgeRepoCached } from "@/lib/forge/cached-repo";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RepoTabNav } from "@/components/repo/repo-tab-nav";

function RepoPageSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-36 animate-pulse rounded border border-stroke-subtle bg-surface-1" />
      <div className="h-8 max-w-xs animate-pulse bg-surface-2" />
      <div className="h-24 animate-pulse rounded border border-stroke-subtle bg-surface-1" />
    </div>
  );
}

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string }>;
}) {
  const [session, { owner, repo }] = await Promise.all([getSession(), params]);
  if (!session) redirect("/");

  let repoData;
  try {
    repoData = await getForgeRepoCached(session.forgeToken, owner, repo, session.forgeType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || msg.includes("Not Found")) {
      notFound();
    }
    throw new Error(`Failed to load repository ${owner}/${repo}: ${msg}`);
  }

  const basePath = `/${owner}/${repo}`;
  const tabs = [
    { id: "code" as const, label: "Code", href: basePath },
    { id: "sessions" as const, label: "Chat", href: `${basePath}/sessions` },
    {
      id: "commits" as const,
      label: "Commits",
      href: `${basePath}/commits/${encodeURIComponent(repoData.defaultBranch)}`,
    },
    { id: "ci" as const, label: "CI", href: `${basePath}/actions` },
    { id: "settings" as const, label: "Settings", href: `${basePath}/settings` },
  ];

  return (
    <div className="min-h-screen bg-surface-0">
      <div className="border-b border-stroke-subtle bg-surface-0">
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="mb-4 flex items-center gap-3">
            <svg
              className="h-5 w-5 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
              />
            </svg>
            <div className="flex items-center gap-1.5 text-lg">
              <Link
                href={`/${owner}`}
                className="font-medium text-accent-text hover:underline"
              >
                {owner}
              </Link>
              <span className="text-text-tertiary">/</span>
              <Link
                href={basePath}
                className="font-semibold text-accent-text hover:underline"
              >
                {repo}
              </Link>
            </div>
            {repoData.isPrivate ? (
              <span className="rounded-full border border-stroke-default px-2 py-0.5 text-xs text-text-tertiary">
                Private
              </span>
            ) : (
              <span className="rounded-full border border-stroke-default px-2 py-0.5 text-xs text-text-tertiary">
                Public
              </span>
            )}
          </div>

          <RepoTabNav basePath={basePath} tabs={tabs} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <Suspense fallback={<RepoPageSkeleton />}>{children}</Suspense>
      </div>
    </div>
  );
}
