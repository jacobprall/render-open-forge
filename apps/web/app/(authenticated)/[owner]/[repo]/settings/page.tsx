import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { redirect, notFound } from "next/navigation";
import { DeleteRepoButton } from "./delete-button";
import { BranchProtectionSettings } from "./branch-protection-settings";
import { PipelineEditor } from "./pipeline-editor";
import { SecretsSettings } from "./secrets-settings";

export default async function RepoSettingsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo } = await params;

  const forge = createForgeProvider(session.forgejoToken);
  let repoData;
  try {
    repoData = await forge.repos.get(owner, repo);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-8">
      {/* General */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">General</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-zinc-400">Repository Name</div>
              <div className="mt-1 text-zinc-100">{repoData.fullName}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-400">Default Branch</div>
              <div className="mt-1 inline-flex items-center gap-1.5">
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
                <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-sm text-zinc-200">
                  {repoData.defaultBranch}
                </span>
              </div>
            </div>
            {repoData.description && (
              <div>
                <div className="text-sm font-medium text-zinc-400">Description</div>
                <div className="mt-1 text-sm text-zinc-300">{repoData.description}</div>
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-zinc-400">Visibility</div>
              <div className="mt-1 text-sm text-zinc-300">
                {repoData.isPrivate ? "Private" : "Public"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Branch protection</h2>
        <BranchProtectionSettings owner={owner} repo={repo} defaultBranch={repoData.defaultBranch} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Agent Configuration</h2>
        <PipelineEditor owner={owner} repo={repo} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Secrets</h2>
        <SecretsSettings owner={owner} repo={repo} />
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-red-400">Danger Zone</h2>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-medium text-zinc-100">Delete this repository</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Once deleted, the repository and all its data will be permanently removed.
                This action cannot be undone.
              </p>
            </div>
            <DeleteRepoButton owner={owner} repo={repo} />
          </div>
        </div>
      </section>
    </div>
  );
}
