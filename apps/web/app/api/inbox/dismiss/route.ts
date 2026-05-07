import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { prEvents } from "@render-open-forge/db";
import { eq, and, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ids: string[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  const db = getDb();
  const userId = String(userSession.userId);

  await db
    .update(prEvents)
    .set({ actionNeeded: false, read: true })
    .where(
      and(
        eq(prEvents.userId, userId),
        inArray(prEvents.id, ids),
      ),
    );

  return NextResponse.json({ success: true });
}
