import { eq } from "drizzle-orm";
import { sessions } from "@render-open-forge/db";
import { getDb } from "../db";

interface SessionForDelivery {
  prNumber: number | null;
  prStatus: string | null;
}

export function isDeliverComplete(session: SessionForDelivery): boolean {
  return session.prNumber != null && session.prStatus === "merged";
}

export async function transitionToComplete(db: ReturnType<typeof getDb>, sessionId: string): Promise<void> {
  const now = new Date();
  await db
    .update(sessions)
    .set({
      status: "completed",
      phase: "complete",
      updatedAt: now,
      lastActivityAt: now,
    })
    .where(eq(sessions.id, sessionId));
}
