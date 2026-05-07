import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { SessionCard } from "./session-card";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const db = getDb();
  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, String(session.userId)))
    .orderBy(desc(sessions.createdAt));

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-sm text-zinc-400">
            Your agent coding sessions
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          New Session
        </Link>
      </div>

      {userSessions.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900">
            <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-zinc-400">No sessions yet.</p>
          <p className="mt-2 text-sm text-zinc-500">
            Start a new session to have an AI agent work on your code.
          </p>
          <Link
            href="/sessions/new"
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Create your first session
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {userSessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
