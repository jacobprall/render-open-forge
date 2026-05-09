import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@openforge/db";
import { eq, desc } from "drizzle-orm";
import { getUserPreferences } from "@/lib/db/loaders";
import { NewSessionInput } from "@/components/session/new-session-input";
import { SessionCard } from "./session-card";

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
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Chat area -- takes most of the screen */}
      <div className="flex min-h-0 flex-1 flex-col px-(--of-space-md) py-(--of-space-lg)">
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

      {/* Recent sessions -- compact list at the bottom */}
      {userSessions.length > 0 && (
        <div className="shrink-0 border-t border-stroke-subtle bg-surface-0">
          <div className="mx-auto max-w-2xl px-(--of-space-md) py-(--of-space-md)">
            <h2 className="mb-(--of-space-sm) text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              Recent sessions
            </h2>
            <div className="flex flex-col gap-px max-h-[30vh] overflow-y-auto">
              {userSessions.slice(0, 10).map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
