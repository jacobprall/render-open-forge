import { NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";
import type { ConflictStrategy } from "@openforge/platform/services";

const VALID_STRATEGIES: ConflictStrategy[] = ["force-push", "manual", "rebase"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data as { strategy?: string };
  const strategy = (VALID_STRATEGIES.includes(body.strategy as ConflictStrategy)
    ? body.strategy
    : "manual") as ConflictStrategy;

  try {
    const result = await getPlatform().mirrors.resolveConflict(auth, id, strategy);
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}
