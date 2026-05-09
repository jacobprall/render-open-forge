import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@openforge/db";
import { eq, and, desc } from "drizzle-orm";
import Link from "next/link";
import { relativeTime } from "@/lib/utils";
import { ArchiveButton } from "./archive-button";

const statusColors: Record<string, string> = {
  running: "bg-accent-bg text-accent-text border-accent/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  failed: "bg-danger/10 text-danger border-danger/20",
  archived: "bg-surface-3/10 text-text-tertiary border-stroke-default",
};

function formatSkillChips(activeSkills: Array<{ slug: string }> | null) {
  if (!activeSkills?.length) return null;
  return activeSkills
    .slice(0, 3)
    .map((s) => s.slug)
    .join(", ");
}

export default async function RepoSessionsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const [userSession, resolvedParams] = await Promise.all([getSession(), params]);
  if (!userSession) redirect("/");

  const { owner, repo } = resolvedParams;
  const repoPath = `${owner}/${repo}`;

  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, String(userSession.userId)),
        eq(sessions.repoPath, repoPath),
      ),
    )
    .orderBy(desc(sessions.createdAt));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-secondary">
          {rows.length} session{rows.length !== 1 ? "s" : ""}
        </h2>
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Session
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="border border-stroke-subtle px-6 py-12 text-center">
          <p className="text-sm text-text-tertiary">No sessions yet for this repository.</p>
          <Link
            href="/sessions"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-text hover:text-accent"
          >
            Create one
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-stroke-subtle border border-stroke-subtle overflow-hidden">
          {rows.map((s) => {
            const skillHint = formatSkillChips(s.activeSkills);
            const canArchive = s.status !== "running" && s.status !== "archived";
            return (
              <div key={s.id} className="group flex items-center transition-colors duration-(--of-duration-instant) hover:bg-surface-1">
                <Link
                  href={`/sessions/${s.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {s.title}
                      </span>
                      {skillHint && (
                        <span className="hidden shrink-0 text-[11px] font-medium text-text-tertiary sm:inline">
                          {skillHint}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-tertiary">
                      <span className="truncate font-mono text-[11px] text-text-tertiary">
                        {s.repoPath}
                        <span className="text-text-tertiary"> · </span>
                        {s.branch}
                      </span>
                      <span className="text-text-tertiary">·</span>
                      <span>{relativeTime(s.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {(s.linesAdded || s.linesRemoved) ? (
                      <span className="text-[11px] font-mono tabular-nums">
                        <span className="text-accent-text/70">+{s.linesAdded ?? 0}</span>
                        {" "}
                        <span className="text-danger/70">-{s.linesRemoved ?? 0}</span>
                      </span>
                    ) : null}
                    {s.prNumber && (
                      <span className="text-[11px] font-mono text-blue-400">
                        PR #{s.prNumber}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColors[s.status] ?? "text-text-tertiary border-stroke-default"}`}
                    >
                      {s.status}
                    </span>
                  </div>
                </Link>
                {canArchive && (
                  <div className="shrink-0 pr-3">
                    <ArchiveButton sessionId={s.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
