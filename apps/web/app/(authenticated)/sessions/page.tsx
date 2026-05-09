import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, projects } from "@openforge/db";
import { eq, desc, inArray } from "drizzle-orm";
import { getUserPreferences } from "@/lib/db/loaders";
import { SessionsView } from "./sessions-view";

export const metadata: Metadata = { title: "Chat" };

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();
  const { project: projectFilter } = await searchParams;

  const [userSessions, prefsRow] = await Promise.all([
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
      .where(eq(sessions.userId, String(session.userId)))
      .orderBy(desc(sessions.createdAt)),
    getUserPreferences(String(session.userId)),
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

  const defaultModelId = prefsRow?.data?.defaultModelId ?? undefined;

  return (
    <SessionsView
      defaultModelId={defaultModelId}
      sessions={userSessions}
      projectNames={projectNames}
      projectFilter={projectFilter}
    />
  );
}
