import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect, notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, chats, chatMessages, userPreferences } from "@render-open-forge/db";
import { eq, and, desc } from "drizzle-orm";
import { SessionWorkspace } from "@/components/session/session-workspace";
import type { AssistantPart } from "@render-open-forge/shared/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, userSession] = await Promise.all([params, getSession()]);
  if (!userSession) return { title: "Session" };

  const db = getDb();
  const [row] = await db
    .select({ title: sessions.title })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(userSession.userId))))
    .limit(1);

  return { title: row?.title ?? "Session" };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, userSession] = await Promise.all([params, getSession()]);
  if (!userSession) redirect("/");

  const db = getDb();
  const userId = String(userSession.userId);

  const [sessionRow, chatRow, prefsRow] = await Promise.all([
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        forgejoRepoPath: sessions.forgejoRepoPath,
        branch: sessions.branch,
        activeSkills: sessions.activeSkills,
        status: sessions.status,
        prNumber: sessions.prNumber,
        prStatus: sessions.prStatus,
        linesAdded: sessions.linesAdded,
        linesRemoved: sessions.linesRemoved,
      })
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({
        id: chats.id,
        modelId: chats.modelId,
        activeRunId: chats.activeRunId,
      })
      .from(chats)
      .where(eq(chats.sessionId, id))
      .orderBy(desc(chats.createdAt))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ defaultModelId: userPreferences.defaultModelId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!sessionRow) notFound();

  const initialModelId =
    chatRow?.modelId?.trim() ||
    prefsRow?.defaultModelId?.trim() ||
    "anthropic/claude-sonnet-4-5";

  const messages = chatRow
    ? await db
        .select({
          id: chatMessages.id,
          role: chatMessages.role,
          parts: chatMessages.parts,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(eq(chatMessages.chatId, chatRow.id))
        .orderBy(chatMessages.createdAt)
    : [];

  return (
    <SessionWorkspace
      initialModelId={initialModelId}
      session={{
        id: sessionRow.id,
        title: sessionRow.title,
        repoPath: sessionRow.forgejoRepoPath,
        branch: sessionRow.branch,
        activeSkills: (sessionRow.activeSkills ?? []) as Array<{ source: string; slug: string }>,
        status: sessionRow.status,
        prNumber: sessionRow.prNumber,
        prStatus: sessionRow.prStatus ?? null,
        linesAdded: sessionRow.linesAdded,
        linesRemoved: sessionRow.linesRemoved,
      }}
      chatId={chatRow?.id ?? null}
      activeRunId={chatRow?.activeRunId ?? null}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: m.parts as AssistantPart[],
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
