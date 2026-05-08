import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { prEvents } from "@render-open-forge/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { paginationSchema, paginatedResponse } from "@/lib/api/pagination";

export async function GET(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = String(userSession.userId);
  const url = req.nextUrl;
  const filter = url.searchParams.get("filter") ?? "unread";

  const paginationParsed = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!paginationParsed.success) {
    return NextResponse.json(
      { error: "Invalid pagination", details: paginationParsed.error.flatten() },
      { status: 400 },
    );
  }
  const params = paginationParsed.data;

  const db = getDb();

  const conditions = [eq(prEvents.userId, userId)];

  if (filter === "unread") {
    conditions.push(eq(prEvents.actionNeeded, true));
    conditions.push(eq(prEvents.read, false));
  } else if (filter === "action_needed") {
    conditions.push(eq(prEvents.actionNeeded, true));
  }

  const whereClause = and(...conditions);

  const [rawItems, [countResult]] = await Promise.all([
    db
      .select()
      .from(prEvents)
      .where(whereClause)
      .orderBy(desc(prEvents.createdAt))
      .limit(params.limit + 1)
      .offset(params.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(prEvents)
      .where(whereClause),
  ]);

  const page = paginatedResponse(rawItems, params);

  return NextResponse.json({
    items: page.data,
    data: page.data,
    pagination: page.pagination,
    total: countResult?.count ?? 0,
    hasMore: page.pagination.hasMore,
  });
}
