import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@openforge/db";
import { eq, desc } from "drizzle-orm";
import { getUserPreferences } from "@/lib/db/loaders";
import { NewSessionInput } from "@/components/session/new-session-input";
import { SessionsDrawer } from "./sessions-drawer";

export const metadata: Metadata = { title: "Sessions" };

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
        prNumber: sessions.prNumber,
        prStatus: sessions.prStatus,
        repoPath: sessions.repoPath,
        activeSkills: sessions.activeSkills,
        branch: sessions.branch,
        lastActivityAt: sessions.lastActivityAt,
        createdAt: sessions.createdAt,
        linesAdded: sessions.linesAdded,
        linesRemoved: sessions.linesRemoved,
      })
      .from(sessions)
      .where(eq(sessions.userId, String(session.userId)))
      .orderBy(desc(sessions.createdAt)),
    getUserPreferences(String(session.userId)),
  ]);

  const defaultModelId = prefsRow?.data?.defaultModelId ?? undefined;

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)]">
      {/* Chat -- fills available space */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col px-(--of-space-lg) py-(--of-space-lg)">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
            <h1 className="mb-(--of-space-xs) text-[20px] font-semibold text-text-primary">
              What do you want to build?
            </h1>
            <p className="mb-(--of-space-md) text-[14px] text-text-tertiary">
              Pick a repo, describe your task, and start a session.
            </p>
            <div className="min-h-0 flex-1">
              <NewSessionInput defaultModelId={defaultModelId ?? undefined} />
            </div>
          </div>
        </div>
      </div>

      {/* Right drawer for recent sessions */}
      <SessionsDrawer sessions={userSessions} />
    </div>
  );
}
