import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { NewPrForm } from "./form";

export default async function NewPullRequestPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo } = await params;

  const forge = createForgeProvider(session.forgejoToken);
  let branches;
  let repoData;
  try {
    [branches, repoData] = await Promise.all([
      forge.branches.list(owner, repo),
      forge.repos.get(owner, repo),
    ]);
  } catch {
    notFound();
  }

  const basePath = `/${owner}/${repo}`;
  const branchNames = branches.map((b) => b.name);

  return (
    <div>
      <Link
        href={`${basePath}/pulls`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-zinc-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to pull requests
      </Link>

      <h1 className="mb-6 text-2xl font-bold tracking-tight">New Pull Request</h1>

      <NewPrForm
        owner={owner}
        repo={repo}
        branches={branchNames}
        defaultBranch={repoData.defaultBranch}
      />
    </div>
  );
}
