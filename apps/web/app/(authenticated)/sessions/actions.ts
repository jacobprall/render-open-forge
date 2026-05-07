"use server";

import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function archiveSessionAction(sessionId: string): Promise<{ error?: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "Unauthorized" };
  }

  try {
    const db = getDb();
    const userId = String(session.userId);

    const [existing] = await db
      .select({ id: sessions.id, status: sessions.status })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);

    if (!existing) {
      return { error: "Session not found" };
    }

    if (existing.status === "running") {
      return { error: "Cannot archive a running session" };
    }

    if (existing.status === "archived") {
      return { error: "Session is already archived" };
    }

    await db
      .update(sessions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));

    revalidatePath("/sessions");
    revalidatePath("/", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to archive session" };
  }
}
