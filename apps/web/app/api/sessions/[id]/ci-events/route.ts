import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions, ciEvents } from "@render-open-forge/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [s] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(auth.userId))))
    .limit(1);

  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(ciEvents)
    .where(eq(ciEvents.sessionId, id))
    .orderBy(desc(ciEvents.createdAt))
    .limit(50);

  return NextResponse.json({ events: rows });
}
