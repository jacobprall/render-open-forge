import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
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
  const forge = createForgeProvider(session.forgeToken, session.forgeType);

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
      <div className="border border-stroke-subtle bg-surface-1">
        <div className="border-b border-stroke-subtle px-6 py-4">
          <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
          {body && (
            <pre className="mt-3 whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-tertiary">
              {body}
            </pre>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-text-tertiary">
              {commit.authorName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-text-primary">
              {commit.authorName}
            </span>
            <span className="text-sm text-text-tertiary">
              &lt;{commit.authorEmail}&gt;
            </span>
          </div>
          <span className="text-sm text-text-tertiary">
            committed {relativeTime(commit.authorDate)}
          </span>
        </div>
      </div>

      {/* Commit metadata */}
      <div className="border border-stroke-subtle">
        <div className="divide-y divide-stroke-subtle">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-20 text-sm text-text-tertiary">Commit</span>
            <code className="font-mono text-sm text-text-secondary">
              {commit.sha}
            </code>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-20 text-sm text-text-tertiary">Date</span>
            <span className="text-sm text-text-secondary">
              {new Date(commit.authorDate).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-20 text-sm text-text-tertiary">Author</span>
            <span className="text-sm text-text-secondary">
              {commit.authorName} &lt;{commit.authorEmail}&gt;
            </span>
          </div>
        </div>
      </div>

      {/* Placeholder for diff viewer */}
      <div className="border border-dashed border-stroke-subtle px-6 py-12 text-center">
        <p className="text-sm text-text-tertiary">
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
