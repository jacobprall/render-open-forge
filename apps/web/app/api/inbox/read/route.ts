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
  const markAll: boolean = body.markAll === true;

  if (!markAll && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ error: "ids array or markAll required" }, { status: 400 });
  }

  const db = getDb();
  const userId = String(userSession.userId);

  if (markAll) {
    await db
      .update(prEvents)
      .set({ read: true })
      .where(
        and(
          eq(prEvents.userId, userId),
          eq(prEvents.read, false),
        ),
      );
  } else {
    await db
      .update(prEvents)
      .set({ read: true })
      .where(
        and(
          eq(prEvents.userId, userId),
          inArray(prEvents.id, ids),
        ),
      );
  }

  return NextResponse.json({ success: true });
}
