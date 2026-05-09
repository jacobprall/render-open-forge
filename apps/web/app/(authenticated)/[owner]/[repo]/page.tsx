import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import { getForgeRepoCached } from "@/lib/forge/cached-repo";
import type { ForgeFileContent } from "@openforge/platform/forge/types";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { relativeTime, formatBytes } from "@/lib/utils";
import { BranchSelector } from "@/components/repo/branch-selector";

export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const [session, { owner, repo: repoName }] = await Promise.all([getSession(), params]);
  if (!session) redirect("/");

  const forge = createForgeProvider(session.forgeToken, session.forgeType);

  let repoData;
  try {
    repoData = await getForgeRepoCached(session.forgeToken, owner, repoName, session.forgeType);
  } catch {
    notFound();
  }

  const [branches, contents, commits, readmeProbe] = await Promise.all([
    forge.branches.list(owner, repoName).catch(() => []),
    forge.files
      .getContents(owner, repoName, "", repoData.defaultBranch)
      .catch(() => [] as ForgeFileContent[]),
    forge.commits
      .list(owner, repoName, {
        sha: repoData.defaultBranch,
        limit: 1,
      })
      .catch(() => []),
    forge.files
      .getContents(owner, repoName, "README.md", repoData.defaultBranch)
      .catch(() => null),
  ]);

  const files = (Array.isArray(contents) ? contents : [contents]).sort(
    (a, b) => {
      if (a.type === "dir" && b.type !== "dir") return -1;
      if (a.type !== "dir" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name);
    },
  );

  const readmeEntry = files.find(
    (f) => f.name.toLowerCase() === "readme.md" && f.type === "file",
  );

  let readmeContent: string | null = null;
  const probe = readmeProbe as ForgeFileContent | null;
  if (probe?.content && probe.encoding === "base64") {
    readmeContent = Buffer.from(probe.content, "base64").toString("utf-8");
  } else if (readmeEntry) {
    try {
      const readmeData = (await forge.files.getContents(
        owner,
        repoName,
        readmeEntry.path,
        repoData.defaultBranch,
      )) as ForgeFileContent;
      if (readmeData.content && readmeData.encoding === "base64") {
        readmeContent = Buffer.from(readmeData.content, "base64").toString(
          "utf-8",
        );
      }
    } catch {
      /* ignore */
    }
  }

  const latestCommit = commits[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Repo header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {repoData.description && (
            <p className="text-sm text-text-tertiary">{repoData.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 border border-stroke-subtle bg-surface-1 px-3 py-1.5">
              <svg
                className="h-4 w-4 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                />
              </svg>
              <code className="select-all text-xs text-text-tertiary">
                {repoData.cloneUrl}
              </code>
            </div>
          </div>
        </div>
        <Link
          href="/sessions"
          className="inline-flex shrink-0 items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
            />
          </svg>
          Agent Session
        </Link>
      </div>

      {/* Branch selector + latest commit */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BranchSelector
          branches={branches}
          currentBranch={repoData.defaultBranch}
          owner={owner}
          repo={repoName}
        />
        {latestCommit && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Link
              href={`/${owner}/${repoName}/commit/${latestCommit.sha}`}
              className="font-mono text-xs text-accent-text hover:underline"
            >
              {latestCommit.sha.slice(0, 7)}
            </Link>
            <span className="truncate max-w-xs">
              {latestCommit.message.split("\n")[0]}
            </span>
            <span className="text-text-tertiary">·</span>
            <span className="whitespace-nowrap text-text-tertiary">
              {relativeTime(latestCommit.authorDate)}
            </span>
          </div>
        )}
      </div>

      {/* File listing */}
      <div className="overflow-hidden border border-stroke-subtle">
        {latestCommit && (
          <div className="flex items-center gap-3 border-b border-stroke-subtle bg-surface-1 px-4 py-2.5 text-sm">
            <span className="font-medium text-text-primary">
              {latestCommit.authorName}
            </span>
            <span className="truncate text-text-tertiary">
              {latestCommit.message.split("\n")[0]}
            </span>
            <span className="ml-auto whitespace-nowrap text-xs text-text-tertiary">
              {relativeTime(latestCommit.authorDate)}
            </span>
          </div>
        )}
        <div className="divide-y divide-stroke-subtle">
          {files.map((file) => (
            <Link
              key={file.path}
              href={
                file.type === "dir"
                  ? `/${owner}/${repoName}/tree/${repoData.defaultBranch}/${file.path}`
                  : `/${owner}/${repoName}/blob/${repoData.defaultBranch}/${file.path}`
              }
              className="flex items-center gap-3 px-4 py-2 transition-colors duration-(--of-duration-instant) hover:bg-surface-1"
            >
              {file.type === "dir" ? (
                <svg
                  className="h-4 w-4 shrink-0 text-accent-text"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 shrink-0 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              )}
              <span className="text-sm text-text-primary">{file.name}</span>
              {file.type === "file" && (
                <span className="ml-auto text-xs text-text-tertiary">
                  {formatBytes(file.size)}
                </span>
              )}
            </Link>
          ))}
          {files.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              This repository is empty
            </div>
          )}
        </div>
      </div>

      {/* README */}
      {readmeContent && (
        <div className="overflow-hidden border border-stroke-subtle">
          <div className="border-b border-stroke-subtle bg-surface-1 px-4 py-2.5 text-sm font-medium text-text-secondary">
            README.md
          </div>
          <div className="p-6">
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-secondary">
              {readmeContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
