import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { prEvents } from "@render-open-forge/db";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = String(userSession.userId);
  const url = req.nextUrl;
  const filter = url.searchParams.get("filter") ?? "unread";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const db = getDb();

  const conditions = [eq(prEvents.userId, userId)];

  if (filter === "unread") {
    conditions.push(eq(prEvents.actionNeeded, true));
    conditions.push(eq(prEvents.read, false));
  } else if (filter === "action_needed") {
    conditions.push(eq(prEvents.actionNeeded, true));
  }

  const [items, [countResult]] = await Promise.all([
    db
      .select()
      .from(prEvents)
      .where(and(...conditions))
      .orderBy(desc(prEvents.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(prEvents)
      .where(and(...conditions)),
  ]);

  return NextResponse.json({
    items,
    total: countResult?.count ?? 0,
    hasMore: offset + items.length < (countResult?.count ?? 0),
  });
}
