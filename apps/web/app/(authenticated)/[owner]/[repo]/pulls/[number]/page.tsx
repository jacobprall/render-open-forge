import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";
import { MergeControls } from "./merge-controls";
import { UnifiedDiffView } from "@/components/pr/unified-diff-view";
import { PRComments } from "@/components/pr/pr-comments";

export default async function PullRequestDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const [session, resolvedParams] = await Promise.all([getSession(), params]);
  if (!session) redirect("/");

  const { owner, repo, number: prNumber } = resolvedParams;
  const num = parseInt(prNumber, 10);
  if (isNaN(num)) notFound();

  const forge = createForgeProvider(session.forgeToken, session.forgeType);
  const [prResult, rawDiff] = await Promise.all([
    forge.pulls
      .get(owner, repo, num)
      .then((p) => ({ ok: true as const, pr: p }))
      .catch(() => ({ ok: false as const })),
    forge.pulls.diff(owner, repo, num).catch(() => ""),
  ]);
  if (!prResult.ok) notFound();
  const pr = prResult.pr;

  const basePath = `/${owner}/${repo}`;

  return (
    <div>
      {/* Back link */}
      <Link
        href={`${basePath}/pulls`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-tertiary transition-colors duration-(--of-duration-instant) hover:text-text-primary"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to pull requests
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {pr.title}
            <span className="ml-2 font-normal text-text-tertiary">#{pr.number}</span>
          </h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {pr.merged ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3 py-1 text-sm font-medium text-purple-400">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
              </svg>
              Merged
            </span>
          ) : pr.state === "closed" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 text-sm font-medium text-danger">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
              Closed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-bg px-3 py-1 text-sm font-medium text-accent-text">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
              </svg>
              Open
            </span>
          )}
          <span className="text-sm text-text-tertiary">
            {pr.author} opened {relativeTime(pr.createdAt)}
          </span>
        </div>
      </div>

      {/* Branch info */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <span className="bg-surface-2 px-2.5 py-1 font-mono text-xs text-accent-text">
          {pr.headRef}
        </span>
        <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
        <span className="bg-surface-2 px-2.5 py-1 font-mono text-xs text-text-secondary">
          {pr.baseRef}
        </span>
      </div>

      {/* Body */}
      <div className="mb-8 border border-stroke-subtle bg-surface-1 p-6">
        <h3 className="mb-3 text-sm font-medium text-text-tertiary">Description</h3>
        {pr.body ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-secondary">
            {pr.body}
          </pre>
        ) : (
          <p className="text-sm italic text-text-tertiary">No description provided.</p>
        )}
      </div>

      {rawDiff ? (
        <div className="mb-8 overflow-hidden border border-stroke-subtle bg-surface-0">
          <h3 className="border-b border-stroke-subtle px-6 py-3 text-sm font-medium text-text-tertiary">
            Changes
          </h3>
          <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
            <UnifiedDiffView raw={rawDiff} />
          </div>
        </div>
      ) : null}

      {/* Comments & Reviews */}
      <div className="mb-8">
        <h3 className="mb-4 text-sm font-medium text-text-tertiary">Discussion</h3>
        <PRComments owner={owner} repo={repo} number={pr.number} />
      </div>

      {/* Merge controls */}
      {pr.state === "open" && !pr.merged && (
        <MergeControls owner={owner} repo={repo} number={pr.number} />
      )}

      {pr.merged && (
        <div className="border border-purple-500/20 bg-purple-500/5 p-5">
          <div className="flex items-center gap-2 text-purple-400">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
            </svg>
            <span className="font-medium">This pull request has been merged.</span>
          </div>
        </div>
      )}
    </div>
  );
}
