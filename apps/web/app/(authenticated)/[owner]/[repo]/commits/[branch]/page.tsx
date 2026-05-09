import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";
import { BranchSelector } from "@/components/repo/branch-selector";

export default async function CommitsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; branch: string }>;
}) {
  const [session, resolvedParams] = await Promise.all([getSession(), params]);
  if (!session) redirect("/");

  const { owner, repo, branch: rawBranch } = resolvedParams;
  const branch = decodeURIComponent(rawBranch);
  const forge = createForgeProvider(session.forgeToken, session.forgeType);

  // The forge API returns 404 for empty repos or refs with no commits; treat as [].
  const [commits, branches] = await Promise.all([
    forge.commits.list(owner, repo, { sha: branch, limit: 50 }).catch(() => []),
    forge.branches.list(owner, repo).catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BranchSelector
            branches={branches}
            currentBranch={branch}
            owner={owner}
            repo={repo}
          />
          <h2 className="text-lg font-semibold text-text-primary">Commits</h2>
        </div>
        <span className="text-sm text-text-tertiary">
          {commits.length} commit{commits.length !== 1 && "s"}
        </span>
      </div>

      <div className="overflow-hidden border border-stroke-subtle">
        <div className="divide-y divide-stroke-subtle">
          {commits.map((commit) => (
            <div
              key={commit.sha}
              className="flex items-start gap-4 px-4 py-3 transition-colors duration-(--of-duration-instant) hover:bg-surface-1"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${owner}/${repo}/commit/${commit.sha}`}
                  className="text-sm font-medium text-text-primary hover:text-accent-text hover:underline"
                >
                  {commit.message.split("\n")[0]}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                  <span className="font-medium text-text-tertiary">
                    {commit.authorName}
                  </span>
                  <span>committed</span>
                  <span>{relativeTime(commit.authorDate)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/${owner}/${repo}/commit/${commit.sha}`}
                  className="border border-stroke-subtle bg-surface-1 px-2 py-1 font-mono text-xs text-accent-text transition-colors duration-(--of-duration-instant) hover:border-stroke-default hover:bg-surface-2"
                >
                  {commit.sha.slice(0, 7)}
                </Link>
              </div>
            </div>
          ))}
          {commits.length === 0 && (
            <div className="px-4 py-12 text-center">
              <svg className="mx-auto mb-3 h-8 w-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-sm text-text-tertiary">No commits found on this branch</p>
              <p className="mt-1 text-xs text-text-tertiary">Push commits to this branch or try switching to a different branch above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
