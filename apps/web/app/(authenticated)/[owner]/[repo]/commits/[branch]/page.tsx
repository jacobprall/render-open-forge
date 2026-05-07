import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";
import { BranchSelector } from "@/components/repo/branch-selector";

export default async function CommitsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; branch: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo, branch: rawBranch } = await params;
  const branch = decodeURIComponent(rawBranch);
  const client = createForgejoClient(session.forgejoToken);

  let commits;
  let branches;
  try {
    [commits, branches] = await Promise.all([
      client.listCommits(owner, repo, { sha: branch, limit: 50 }),
      client.listBranches(owner, repo).catch(() => []),
    ]);
  } catch {
    notFound();
  }

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
          <h2 className="text-lg font-semibold text-zinc-200">Commits</h2>
        </div>
        <span className="text-sm text-zinc-500">
          {commits.length} commit{commits.length !== 1 && "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="divide-y divide-zinc-800/50">
          {commits.map((commit) => (
            <div
              key={commit.sha}
              className="flex items-start gap-4 px-4 py-3 transition hover:bg-zinc-900/50"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${owner}/${repo}/commit/${commit.sha}`}
                  className="text-sm font-medium text-zinc-200 hover:text-emerald-400 hover:underline"
                >
                  {commit.commit.message.split("\n")[0]}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-400">
                    {commit.commit.author.name}
                  </span>
                  <span>committed</span>
                  <span>{relativeTime(commit.commit.author.date)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/${owner}/${repo}/commit/${commit.sha}`}
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-xs text-emerald-400 transition hover:border-zinc-700 hover:bg-zinc-800"
                >
                  {commit.sha.slice(0, 7)}
                </Link>
              </div>
            </div>
          ))}
          {commits.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              No commits found on this branch
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
