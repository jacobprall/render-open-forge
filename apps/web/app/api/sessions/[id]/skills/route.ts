import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db";
import { and, eq } from "drizzle-orm";
import type { ActiveSkillRef } from "@render-open-forge/skills";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [row] = await db
    .select({ activeSkills: sessions.activeSkills })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(auth.userId))))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ activeSkills: row.activeSkills ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const activeSkills = body.activeSkills as ActiveSkillRef[] | undefined;
  if (!Array.isArray(activeSkills)) {
    return NextResponse.json({ error: "activeSkills array required" }, { status: 400 });
  }

  for (const r of activeSkills) {
    if (
      !r ||
      (r.source !== "builtin" && r.source !== "user" && r.source !== "repo") ||
      typeof r.slug !== "string"
    ) {
      return NextResponse.json({ error: "Invalid skill ref" }, { status: 400 });
    }
  }

  const db = getDb();
  const updated = await db
    .update(sessions)
    .set({
      activeSkills,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(auth.userId))))
    .returning({ id: sessions.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
