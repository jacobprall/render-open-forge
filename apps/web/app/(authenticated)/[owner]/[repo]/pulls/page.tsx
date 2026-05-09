import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";
import type { ForgePullRequest } from "@openforge/platform/forge/types";
import { redirect } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";

function StatusBadge({ pr }: { pr: ForgePullRequest }) {
  if (pr.merged) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
          <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
        </svg>
        Merged
      </span>
    );
  }
  if (pr.state === "closed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
        </svg>
        Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent-text">
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
        <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
      </svg>
      Open
    </span>
  );
}

function PrRow({
  pr,
  basePath,
}: {
  pr: ForgePullRequest;
  basePath: string;
}) {
  return (
    <Link
      href={`${basePath}/pulls/${pr.number}`}
      className="flex items-center gap-4 border-b border-stroke-subtle px-5 py-4 transition-colors duration-(--of-duration-instant) hover:bg-surface-2 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary hover:text-accent-text">
            {pr.title}
          </span>
          <StatusBadge pr={pr} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
          <span>#{pr.number}</span>
          <span>opened by {pr.author}</span>
          <span>{relativeTime(pr.createdAt)}</span>
          <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary">
            {pr.headRef}
            <svg className="h-3 w-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            {pr.baseRef}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function PullRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [session, { owner, repo }, { state }] = await Promise.all([
    getSession(),
    params,
    searchParams,
  ]);
  if (!session) redirect("/");
  const activeTab = state === "closed" ? "closed" : "open";

  const forge = createForgeProvider(session.forgeToken, session.forgeType);
  let pullRequests: ForgePullRequest[] = [];
  try {
    pullRequests = await forge.pulls.list(owner, repo, activeTab);
  } catch {
    // fall through with empty array
  }

  const basePath = `/${owner}/${repo}`;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold tracking-tight">Pull Requests</h2>
        <Link
          href={`${basePath}/pulls/new`}
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Pull Request
        </Link>
      </div>

      {/* Tab filter */}
      <div className="mb-4 flex gap-1 bg-surface-1 p-1">
        <Link
          href={`${basePath}/pulls?state=open`}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-(--of-duration-instant) ${
            activeTab === "open"
              ? "bg-surface-2 text-text-primary"
              : "text-text-tertiary hover:text-text-primary"
          }`}
        >
          Open
        </Link>
        <Link
          href={`${basePath}/pulls?state=closed`}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-(--of-duration-instant) ${
            activeTab === "closed"
              ? "bg-surface-2 text-text-primary"
              : "text-text-tertiary hover:text-text-primary"
          }`}
        >
          Closed
        </Link>
      </div>

      {/* PR list */}
      {pullRequests.length === 0 ? (
        <div className="border border-stroke-subtle bg-surface-1 px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <svg className="h-6 w-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-secondary">
            No {activeTab} pull requests
          </h3>
          <p className="mt-1 text-sm text-text-tertiary">
            {activeTab === "open"
              ? "Create a pull request to propose changes to this repository."
              : "No closed pull requests found."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border border-stroke-subtle bg-surface-1">
          {pullRequests.map((pr) => (
            <PrRow key={pr.id} pr={pr} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}
