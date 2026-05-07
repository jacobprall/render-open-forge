import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, prEvents } from "@render-open-forge/db";
import { eq, desc, isNotNull, and, sql } from "drizzle-orm";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";
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
        forgejoRepoPath: sessions.forgejoRepoPath,
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
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Pull Requests</h1>
        <p className="mt-1 text-sm text-zinc-400">
          All PRs opened by your agent sessions
        </p>
      </div>

      {/* View tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-900 p-1">
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
        <EmptyState view={view} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          {sessionRows.map((row) => (
            <PrRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ view }: { view: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
        <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-zinc-300">
        No {view !== "all" ? view : ""} pull requests
      </h3>
      <p className="mt-1 text-sm text-zinc-500">
        When your agent opens PRs, they&apos;ll appear here.
      </p>
    </div>
  );
}

function PrRow({
  row,
}: {
  row: {
    id: string;
    title: string;
    forgejoRepoPath: string;
    branch: string;
    baseBranch: string;
    prNumber: number | null;
    prStatus: string | null;
    status: string;
    linesAdded: number | null;
    linesRemoved: number | null;
    updatedAt: Date;
    createdAt: Date;
  };
}) {
  const statusStyles: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-400",
    merged: "bg-purple-500/15 text-purple-400",
    closed: "bg-red-500/15 text-red-400",
  };

  const prStatus = row.prStatus ?? "open";
  const prUrl = `/${row.forgejoRepoPath}/pulls/${row.prNumber}`;

  return (
    <div className="flex items-center gap-4 border-b border-zinc-800 px-5 py-4 last:border-b-0 transition hover:bg-zinc-800/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={prUrl}
            className="font-semibold text-zinc-100 hover:text-emerald-400 transition truncate"
          >
            {row.title}
          </Link>
          <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[prStatus] ?? statusStyles.open}`}>
            {prStatus}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <Link href={`/${row.forgejoRepoPath}`} className="hover:text-zinc-300 transition">
            {row.forgejoRepoPath}
          </Link>
          <span>#{row.prNumber}</span>
          <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
            {row.branch}
            <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            {row.baseBranch}
          </span>
          {(row.linesAdded || row.linesRemoved) ? (
            <span className="font-mono tabular-nums">
              <span className="text-emerald-400/70">+{row.linesAdded ?? 0}</span>
              {" "}
              <span className="text-red-400/70">-{row.linesRemoved ?? 0}</span>
            </span>
          ) : null}
          <span suppressHydrationWarning>{relativeTime(row.updatedAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/sessions/${row.id}`}
          className="rounded px-2 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
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
      className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
      {count != null && count > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${
            highlight && !active
              ? "bg-emerald-500/20 text-emerald-400"
              : highlight && active
                ? "bg-emerald-500 text-white"
                : active
                  ? "bg-zinc-700 text-zinc-300"
                  : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
