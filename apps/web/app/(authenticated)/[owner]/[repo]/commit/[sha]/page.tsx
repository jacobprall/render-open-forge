import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";

export default async function CommitDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; sha: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { owner, repo, sha } = await params;
  const forge = createForgeProvider(session.forgejoToken);

  let commits;
  try {
    commits = await forge.commits.list(owner, repo, { sha, limit: 1 });
  } catch {
    notFound();
  }

  const commit = commits[0];
  if (!commit) notFound();

  const messageParts = commit.message.split("\n");
  const title = messageParts[0];
  const body = messageParts.slice(1).join("\n").trim();

  return (
    <div className="space-y-6">
      {/* Commit header */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30">
        <div className="border-b border-zinc-800 px-6 py-4">
          <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
          {body && (
            <pre className="mt-3 whitespace-pre-wrap font-mono text-sm leading-relaxed text-zinc-400">
              {body}
            </pre>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-400">
              {commit.authorName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-zinc-200">
              {commit.authorName}
            </span>
            <span className="text-sm text-zinc-500">
              &lt;{commit.authorEmail}&gt;
            </span>
          </div>
          <span className="text-sm text-zinc-500">
            committed {relativeTime(commit.authorDate)}
          </span>
        </div>
      </div>

      {/* Commit metadata */}
      <div className="rounded-lg border border-zinc-800">
        <div className="divide-y divide-zinc-800/50">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-20 text-sm text-zinc-500">Commit</span>
            <code className="font-mono text-sm text-zinc-300">
              {commit.sha}
            </code>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-20 text-sm text-zinc-500">Date</span>
            <span className="text-sm text-zinc-300">
              {new Date(commit.authorDate).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-20 text-sm text-zinc-500">Author</span>
            <span className="text-sm text-zinc-300">
              {commit.authorName} &lt;{commit.authorEmail}&gt;
            </span>
          </div>
        </div>
      </div>

      {/* Placeholder for diff viewer */}
      <div className="rounded-lg border border-dashed border-zinc-800 px-6 py-12 text-center">
        <p className="text-sm text-zinc-500">
          Diff viewer will be added in a future update.
        </p>
        <Link
          href={`/${owner}/${repo}/commits/${commit.sha}`}
          className="mt-2 inline-block text-sm text-accent-text hover:underline"
        >
          ← Back to commits
        </Link>
      </div>
    </div>
  );
}
