import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, chatMessages, chats } from "@render-open-forge/db";
import { eq, and, asc } from "drizzle-orm";
import { resolveLlmApiKeys } from "@render-open-forge/shared";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const keys = await resolveLlmApiKeys(db, String(userSession.userId));
  const apiKey = keys.anthropic;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const [sessionRow] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(userSession.userId))))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const [chatRow] = await db
    .select()
    .from(chats)
    .where(eq(chats.sessionId, id))
    .limit(1);

  if (!chatRow) {
    return NextResponse.json({ error: "No chat found" }, { status: 404 });
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
    return NextResponse.json({ title: sessionRow.title });
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
        // Fast, cheap model — only used for 3–6 word titles after the first message
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
      return NextResponse.json({ title: sessionRow.title });
    }

    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = body.content?.[0]?.text?.trim();
    if (!raw) {
      return NextResponse.json({ title: sessionRow.title });
    }

    const title = raw.replace(/^["']|["']$/g, "").slice(0, 80);

    await db.update(sessions).set({ title }).where(eq(sessions.id, id));
    await db.update(chats).set({ title }).where(eq(chats.sessionId, id));

    return NextResponse.json({ title });
  } catch (err) {
    console.error("[auto-title] Failed:", err);
    return NextResponse.json({ title: sessionRow.title });
  }
}
