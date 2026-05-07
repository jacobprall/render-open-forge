import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

function formatRelativeTime(date: Date | null): string {
  if (!date) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusColors: Record<string, string> = {
  running: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  archived: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const phaseColors: Record<string, string> = {
  understand: "text-purple-400",
  spec: "text-amber-400",
  execute: "text-emerald-400",
  verify: "text-cyan-400",
  deliver: "text-blue-400",
  complete: "text-zinc-400",
  failed: "text-red-400",
};

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
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="block rounded-lg border border-zinc-800 p-4 transition hover:border-zinc-600 hover:bg-zinc-900/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{s.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[s.status]}`}
                    >
                      {s.status}
                    </span>
                    <span className={`text-xs font-medium ${phaseColors[s.phase]}`}>
                      {s.phase}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
                    <span className="font-mono text-xs">{s.forgejoRepoPath}</span>
                    <span className="text-zinc-700">•</span>
                    <span className="font-mono text-xs">{s.branch}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs text-zinc-500">
                  <span>{formatRelativeTime(s.lastActivityAt ?? s.createdAt)}</span>
                  {(s.linesAdded || s.linesRemoved) ? (
                    <span className="font-mono">
                      <span className="text-emerald-400">+{s.linesAdded ?? 0}</span>
                      {" "}
                      <span className="text-red-400">-{s.linesRemoved ?? 0}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
