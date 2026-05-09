import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, userPreferences } from "@openforge/db";
import { eq, desc } from "drizzle-orm";
import { NewSessionInput } from "@/components/session/new-session-input";
import { SessionCard } from "./session-card";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();

  const [userSessions, prefsRow] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, String(session.userId)))
      .orderBy(desc(sessions.createdAt)),
    db
      .select({ data: userPreferences.data })
      .from(userPreferences)
      .where(eq(userPreferences.userId, String(session.userId)))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const defaultModelId = prefsRow?.data?.defaultModelId ?? undefined;

  return (
    <div className="mx-auto max-w-2xl px-(--of-space-md) py-(--of-space-2xl)">
      <div className="mb-(--of-space-2xl)">
        <h1 className="text-[20px] font-semibold text-text-primary mb-(--of-space-sm)">
          What do you want to build?
        </h1>
        <p className="text-[15px] text-text-tertiary mb-(--of-space-lg)">
          Pick a repo, describe your task, and start a session.
        </p>
        <NewSessionInput defaultModelId={defaultModelId ?? undefined} />
      </div>

      {userSessions.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary mb-(--of-space-sm)">
            Recent sessions
          </h2>
          <div className="flex flex-col">
            {userSessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
