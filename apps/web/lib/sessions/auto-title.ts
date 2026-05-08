import { getDb } from "@/lib/db";
import { sessions, chatMessages, chats } from "@render-open-forge/db";
import { eq, and, asc } from "drizzle-orm";
import { resolveLlmApiKeys } from "@render-open-forge/platform";

export type AutoTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: "no-api-key" | "not-found" | "no-chat" };

/**
 * Generates and persists a short title from recent chat messages (Anthropic Haiku).
 * Call after the first user message is stored; requires the session owner id.
 */
export async function generateAutoTitle(
  sessionId: string,
  userId: string,
): Promise<AutoTitleResult> {
  const db = getDb();

  const keys = await resolveLlmApiKeys(db, userId);
  const apiKey = keys.anthropic;
  if (!apiKey) {
    return { ok: false, reason: "no-api-key" };
  }

  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (!sessionRow) {
    return { ok: false, reason: "not-found" };
  }

  const [chatRow] = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, sessionId))
    .limit(1);

  if (!chatRow) {
    return { ok: false, reason: "no-chat" };
  }

  const msgs = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatRow.id))
    .orderBy(asc(chatMessages.createdAt))
    .limit(6);

  const textParts = msgs
    .flatMap((m) => {
      const parts = m.parts as Array<{ type: string; text?: string }>;
      return parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => `${m.role}: ${p.text}`);
    })
    .slice(0, 4);

  if (textParts.length === 0) {
    return { ok: true, title: sessionRow.title };
  }

  const conversation = textParts.join("\n").slice(0, 2000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Generate a short title (3-6 words, no quotes) for this coding session:\n\n${conversation}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.error("[auto-title] Anthropic API error:", res.status);
      return { ok: true, title: sessionRow.title };
    }

    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = body.content?.[0]?.text?.trim();
    if (!raw) {
      return { ok: true, title: sessionRow.title };
    }

    const title = raw.replace(/^["']|["']$/g, "").slice(0, 80);

    await db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
    await db.update(chats).set({ title }).where(eq(chats.sessionId, sessionId));

    return { ok: true, title };
  } catch (err) {
    console.error("[auto-title] Failed:", err);
    return { ok: true, title: sessionRow.title };
  }
}
