import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { prEvents } from "@render-open-forge/db";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const userId = String(userSession.userId);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prEvents)
    .where(
      and(
        eq(prEvents.userId, userId),
        eq(prEvents.actionNeeded, true),
        eq(prEvents.read, false),
      ),
    );

  return NextResponse.json({ count: result?.count ?? 0 });
}
