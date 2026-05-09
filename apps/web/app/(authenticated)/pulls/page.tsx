import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, prEvents } from "@openforge/db";
import { eq, desc, isNotNull, and, sql } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, GitPullRequest } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { PageShell, EmptyState, StatusBadge } from "@/components/primitives";
import { ReviewButton } from "./review-button";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = { title: "Pull Requests" };

type PrView = "inbox" | "open" | "merged" | "closed" | "all";

export default async function PullRequestsGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  if (!session) redirect("/");

  const view = (sp.view ?? "inbox") as PrView;
  const userId = String(session.userId);
  const db = getDb();

  const [inboxCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prEvents)
    .where(
      and(
        eq(prEvents.userId, userId),
        eq(prEvents.actionNeeded, true),
        eq(prEvents.read, false),
      ),
    );

  const prCounts = await db
    .select({
      prStatus: sessions.prStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.prNumber)))
    .groupBy(sessions.prStatus);

  const countMap: Record<string, number> = {};
  let total = 0;
  for (const c of prCounts) {
    if (c.prStatus) countMap[c.prStatus] = c.count;
    total += c.count;
  }

  let inboxItems: typeof prEventsResult = [];
  let sessionRows: typeof sessionsResult = [];

  const prEventsResult = await (async () => {
    if (view !== "inbox") return [];
    return db
      .select()
      .from(prEvents)
      .where(
        and(
          eq(prEvents.userId, userId),
          eq(prEvents.actionNeeded, true),
          eq(prEvents.read, false),
        ),
      )
      .orderBy(desc(prEvents.createdAt))
      .limit(50);
  })();
  inboxItems = prEventsResult;

  const sessionsResult = await (async () => {
    if (view === "inbox") return [];
    const conditions = [
      eq(sessions.userId, userId),
      isNotNull(sessions.prNumber),
    ];
    if (view === "open") conditions.push(eq(sessions.prStatus, "open"));
    else if (view === "merged") conditions.push(eq(sessions.prStatus, "merged"));
    else if (view === "closed") conditions.push(eq(sessions.prStatus, "closed"));

    return db
      .select({
        id: sessions.id,
        title: sessions.title,
        repoPath: sessions.repoPath,
        branch: sessions.branch,
        baseBranch: sessions.baseBranch,
        prNumber: sessions.prNumber,
        prStatus: sessions.prStatus,
        status: sessions.status,
        linesAdded: sessions.linesAdded,
        linesRemoved: sessions.linesRemoved,
        updatedAt: sessions.updatedAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.updatedAt))
      .limit(100);
  })();
  sessionRows = sessionsResult;

  return (
    <PageShell
      title="Pull Requests"
      description="All PRs opened by your agent sessions"
      className="mx-auto max-w-5xl"
    >
      {/* View tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-surface-1 p-1">
        <FilterTab href="/pulls?view=inbox" active={view === "inbox"} count={inboxCount?.count} highlight>
          Needs Attention
        </FilterTab>
        <FilterTab href="/pulls?view=open" active={view === "open"} count={countMap.open}>
          Open
        </FilterTab>
        <FilterTab href="/pulls?view=merged" active={view === "merged"} count={countMap.merged}>
          Merged
        </FilterTab>
        <FilterTab href="/pulls?view=closed" active={view === "closed"} count={countMap.closed}>
          Closed
        </FilterTab>
        <FilterTab href="/pulls?view=all" active={view === "all"} count={total}>
          All
        </FilterTab>
      </div>

      {view === "inbox" ? (
        <InboxView
          initialItems={inboxItems.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
          }))}
        />
      ) : sessionRows.length === 0 ? (
        <EmptyState
          icon={<GitPullRequest className="h-6 w-6" />}
          title={`No ${view !== "all" ? view : ""} pull requests`}
          description="When your agent opens PRs, they'll appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-stroke-default bg-surface-1/50">
          {sessionRows.map((row) => (
            <PrRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function PrRow({
  row,
}: {
  row: {
    id: string;
    title: string;
    repoPath: string | null;
    branch: string | null;
    baseBranch: string | null;
    prNumber: number | null;
    prStatus: string | null;
    status: string;
    linesAdded: number | null;
    linesRemoved: number | null;
    updatedAt: Date;
    createdAt: Date;
  };
}) {
  const prStatus = row.prStatus ?? "open";
  const prUrl = `/${row.repoPath ?? ""}/pulls/${row.prNumber}`;

  return (
    <div className="flex items-center gap-4 border-b border-stroke-default px-5 py-4 last:border-b-0 transition hover:bg-surface-1/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={prUrl}
            className="font-semibold text-text-primary hover:text-accent-text transition truncate"
          >
            {row.title}
          </Link>
          <StatusBadge status={prStatus} className="shrink-0" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
          <Link href={`/${row.repoPath ?? ""}`} className="hover:text-text-primary transition">
            {row.repoPath ?? "scratch"}
          </Link>
          <span>#{row.prNumber}</span>
          <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
            {row.branch}
            <ArrowRight className="h-3 w-3 text-text-tertiary" />
            {row.baseBranch}
          </span>
          {(row.linesAdded || row.linesRemoved) ? (
            <span className="font-mono tabular-nums">
              <span className="text-success">+{row.linesAdded ?? 0}</span>
              {" "}
              <span className="text-danger">-{row.linesRemoved ?? 0}</span>
            </span>
          ) : null}
          <span suppressHydrationWarning>{relativeTime(row.updatedAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/sessions/${row.id}`}
          className="rounded px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary"
        >
          Session
        </Link>
        {prStatus === "open" && (
          <ReviewButton sessionId={row.id} />
        )}
      </div>
    </div>
  );
}

function FilterTab({
  href,
  active,
  count,
  highlight,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-surface-2 text-text-primary"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {children}
      {count != null && count > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${
            highlight && !active
              ? "bg-accent-bg text-accent-text"
              : highlight && active
                ? "bg-accent text-white"
                : active
                  ? "bg-surface-3 text-text-secondary"
                  : "bg-surface-2 text-text-tertiary"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
