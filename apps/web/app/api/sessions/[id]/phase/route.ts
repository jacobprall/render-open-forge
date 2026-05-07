import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db";
import { and, eq } from "drizzle-orm";
import type { SessionPhase } from "@render-open-forge/db";

const phases: SessionPhase[] = ["understand", "spec", "execute", "verify", "deliver", "complete", "failed"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const phase = body.phase as string | undefined;
  if (!phase || !phases.includes(phase as SessionPhase)) {
    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  }

  const db = getDb();
  const updated = await db
    .update(sessions)
    .set({
      phase: phase as SessionPhase,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(auth.userId))))
    .returning({ id: sessions.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, phase });
}
