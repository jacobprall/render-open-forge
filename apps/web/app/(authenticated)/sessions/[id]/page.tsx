import { getSession } from "@/lib/auth/session";
import { redirect, notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, chats, chatMessages } from "@render-open-forge/db";
import { eq, and, desc } from "drizzle-orm";
import Link from "next/link";
import { ChatPanel } from "@/components/session/chat-panel";
import { SessionSidePanel } from "@/components/session/session-side-panel";
import type { AssistantPart } from "@render-open-forge/shared";

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

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userSession = await getSession();
  if (!userSession) redirect("/");

  const db = getDb();

  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(userSession.userId))))
    .limit(1);

  if (!sessionRow) notFound();

  const [chatRow] = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, id))
    .orderBy(desc(chats.createdAt))
    .limit(1);

  const messages = chatRow
    ? await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.chatId, chatRow.id))
        .orderBy(chatMessages.createdAt)
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/sessions"
            className="text-zinc-400 transition hover:text-zinc-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="font-semibold">{sessionRow.title}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="font-mono">{sessionRow.forgejoRepoPath}</span>
              <span className="text-zinc-700">→</span>
              <span className="font-mono">{sessionRow.branch}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${phaseColors[sessionRow.phase]}`}>
            {sessionRow.phase}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[sessionRow.status]}`}
          >
            {sessionRow.status}
          </span>
          {sessionRow.prNumber && (
            <a
              href={`/${sessionRow.forgejoRepoPath}/pulls/${sessionRow.prNumber}`}
              className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400 transition hover:bg-blue-500/20"
            >
              PR #{sessionRow.prNumber}
            </a>
          )}
          {(sessionRow.linesAdded || sessionRow.linesRemoved) ? (
            <span className="font-mono text-xs">
              <span className="text-emerald-400">+{sessionRow.linesAdded ?? 0}</span>
              {" "}
              <span className="text-red-400">-{sessionRow.linesRemoved ?? 0}</span>
            </span>
          ) : null}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <ChatPanel
          sessionId={id}
          chatId={chatRow?.id ?? null}
          activeRunId={chatRow?.activeRunId ?? null}
          initialMessages={messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: m.parts as AssistantPart[],
            createdAt: m.createdAt.toISOString(),
          }))}
        />
        <SessionSidePanel sessionId={id} />
      </div>
    </div>
  );
}
