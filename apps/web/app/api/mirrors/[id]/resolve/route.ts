import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { resolveMirrorConflict, type ConflictStrategy } from "@/lib/sync/mirror-engine";

const VALID_STRATEGIES: ConflictStrategy[] = ["force-push", "manual", "rebase"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { strategy?: string };
  const strategy = (VALID_STRATEGIES.includes(body.strategy as ConflictStrategy)
    ? body.strategy
    : "manual") as ConflictStrategy;

  const db = getDb();
  const result = await resolveMirrorConflict(db, id, strategy);
  return NextResponse.json(result);
}
