import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@openforge/db";
import { eq, desc, isNotNull, and } from "drizzle-orm";
import Link from "next/link";
import { ExternalLink, GitPullRequest } from "lucide-react";
import { PageShell, EmptyState, StatusBadge } from "@/components/primitives";
import { agentSessionPullHref } from "@/lib/session-pr-href";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Pull Requests" };

export default async function PullRequestsGlobalPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const userId = String(session.userId);
  const db = getDb();

  const forgejoWebOrigin =
    process.env.FORGEJO_PUBLIC_URL || process.env.FORGEJO_EXTERNAL_URL || null;

  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      repoPath: sessions.repoPath,
      prNumber: sessions.prNumber,
      prStatus: sessions.prStatus,
      status: sessions.status,
      upstreamPrUrl: sessions.upstreamPrUrl,
      updatedAt: sessions.updatedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.prNumber)))
    .orderBy(desc(sessions.updatedAt))
    .limit(100);

  return (
    <PageShell
      title="Pull Requests"
      description="Sessions with an open pull request"
      className="mx-auto max-w-5xl"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<GitPullRequest className="h-6 w-6" />}
          title="No pull requests yet"
          description="When a session opens a PR, it will show up here."
        />
      ) : (
        <ul className="divide-y divide-stroke-default overflow-hidden rounded-xl border border-stroke-default bg-surface-1/50">
          {rows.map((row) => {
            const prNum = row.prNumber!;
            const prHref = agentSessionPullHref({
              repoPath: row.repoPath,
              prNumber: prNum,
              upstreamPrUrl: row.upstreamPrUrl,
              forgejoWebOrigin,
            });
            const prStatus = row.prStatus ?? "open";
            const isExternal =
              prHref.startsWith("http://") || prHref.startsWith("https://");

            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 px-5 py-4 transition-colors duration-(--of-duration-instant) hover:bg-surface-1/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/sessions/${row.id}`}
                      className="truncate text-sm font-semibold text-text-primary hover:text-accent-text transition-colors duration-(--of-duration-instant)"
                    >
                      {row.title}
                    </Link>
                    <StatusBadge status={prStatus} className="shrink-0" />
                    <span className="text-xs text-text-tertiary tabular-nums">
                      #{prNum}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-tertiary">
                    <span className="font-mono text-text-secondary">
                      {row.repoPath ?? "—"}
                    </span>
                    <span className="text-text-tertiary">·</span>
                    <span>session {row.status}</span>
                    <span className="text-text-tertiary">·</span>
                    <span suppressHydrationWarning>
                      updated {relativeTime(row.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={prHref}
                    {...(isExternal
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="inline-flex items-center gap-1.5 rounded-md border border-stroke-default bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-(--of-duration-instant) hover:bg-surface-3 hover:text-accent-text"
                  >
                    View PR
                    {isExternal ? (
                      <ExternalLink className="h-3.5 w-3.5 text-text-tertiary" />
                    ) : null}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
