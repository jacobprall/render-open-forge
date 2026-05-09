import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@openforge/db";
import { eq, desc } from "drizzle-orm";
import { getUserPreferences } from "@/lib/db/loaders";
import { SessionsView } from "./sessions-view";

export const metadata: Metadata = { title: "Chat" };

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();

  const [userSessions, prefsRow] = await Promise.all([
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        status: sessions.status,
        repoPath: sessions.repoPath,
        branch: sessions.branch,
        lastActivityAt: sessions.lastActivityAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, String(session.userId)))
      .orderBy(desc(sessions.createdAt)),
    getUserPreferences(String(session.userId)),
  ]);

  const defaultModelId = prefsRow?.data?.defaultModelId ?? undefined;

  return (
    <SessionsView
      defaultModelId={defaultModelId}
      sessions={userSessions}
    />
  );
}
