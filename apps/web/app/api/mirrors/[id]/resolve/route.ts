import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";
import type { ConflictStrategy } from "@openforge/platform/services";

const VALID_STRATEGIES: ConflictStrategy[] = ["force-push", "manual", "rebase"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { strategy?: string };
  const strategy = (VALID_STRATEGIES.includes(body.strategy as ConflictStrategy)
    ? body.strategy
    : "manual") as ConflictStrategy;

  try {
    const result = await getPlatform().mirrors.resolveConflict(auth, id, strategy);
    return NextResponse.json(result);
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Conflict resolution failed" },
      { status: 500 },
    );
  }
}
