import { NextRequest, NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string; commentId: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, commentId } = await params;
  const cid = Number(commentId);
  if (!Number.isFinite(cid) || cid < 1) {
    return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });
  }

  let unresolve = false;
  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data as Record<string, unknown>;
  if (typeof body.unresolve === "boolean") {
    unresolve = body.unresolve;
  }

  try {
    const result = await getPlatform().pullRequests.resolveComment(auth, owner, repo, cid, unresolve);
    return NextResponse.json({ success: true, resolved: result.resolved });
  } catch (e) {
    return handlePlatformError(e);
  }
}
