import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { sessions } from "@render-open-forge/db";
import { and, eq } from "drizzle-orm";

/**
 * PATCH — shallow-merge keys into sessions.project_config.
 * Accepts `{ projectConfig }` or `{ projectConfigPatch }` (either as a shallow patch object).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const shallow =
    typeof b.projectConfigPatch === "object" && b.projectConfigPatch !== null
      ? (b.projectConfigPatch as Record<string, unknown>)
      : typeof b.projectConfig === "object" && b.projectConfig !== null
        ? (b.projectConfig as Record<string, unknown>)
        : null;

  if (!shallow) {
    return NextResponse.json({ error: "Provide projectConfig or projectConfigPatch object" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(auth.userId))))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const base =
    typeof row.projectConfig === "object" && row.projectConfig !== null
      ? ({ ...(row.projectConfig as object) } as Record<string, unknown>)
      : {};
  Object.assign(base, shallow);

  const [updated] = await db
    .update(sessions)
    .set({
      projectConfig: Object.keys(base).length ? base : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, id), eq(sessions.userId, String(auth.userId))))
    .returning({ id: sessions.id, projectConfig: sessions.projectConfig });

  return NextResponse.json({ success: true, projectConfig: updated?.projectConfig });
}
