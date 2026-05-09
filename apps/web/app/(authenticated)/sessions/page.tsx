import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, projects, projectRepos } from "@openforge/db";
import { eq, desc, inArray } from "drizzle-orm";
import { getUserPreferences } from "@/lib/db/loaders";
import { SessionsView } from "./sessions-view";

export const metadata: Metadata = { title: "Chat" };

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; repo?: string; branch?: string }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) redirect("/");

  const db = getDb();
  const { project: projectFilter, repo: repoParam, branch: branchParam } = params;
  const userId = String(session.userId);

  const repoQuery =
    !repoParam && projectFilter
      ? db
          .select({
            repoPath: projectRepos.repoPath,
            defaultBranch: projectRepos.defaultBranch,
            isPrimary: projectRepos.isPrimary,
          })
          .from(projectRepos)
          .where(eq(projectRepos.projectId, projectFilter))
          .orderBy(desc(projectRepos.isPrimary))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null);

  const [userSessions, prefsRow, resolvedRepo] = await Promise.all([
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        status: sessions.status,
        repoPath: sessions.repoPath,
        branch: sessions.branch,
        projectId: sessions.projectId,
        lastActivityAt: sessions.lastActivityAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt)),
    getUserPreferences(userId),
    repoQuery,
  ]);

  const projectIds = [...new Set(userSessions.map((s) => s.projectId).filter(Boolean))] as string[];
  const projectRows = projectIds.length > 0
    ? await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, projectIds))
    : [];
  const projectNames: Record<string, string> = {};
  for (const p of projectRows) {
    projectNames[p.id] = p.name;
  }

  const defaultRepo = repoParam ?? resolvedRepo?.repoPath;
  const defaultBranch = branchParam ?? resolvedRepo?.defaultBranch ?? (defaultRepo ? "main" : undefined);

  const defaultModelId = prefsRow?.data?.defaultModelId ?? undefined;

  return (
    <SessionsView
      defaultModelId={defaultModelId}
      sessions={userSessions}
      projectNames={projectNames}
      projectFilter={projectFilter}
      defaultRepo={defaultRepo}
      defaultBranch={defaultBranch}
      projectId={projectFilter}
    />
  );
}
