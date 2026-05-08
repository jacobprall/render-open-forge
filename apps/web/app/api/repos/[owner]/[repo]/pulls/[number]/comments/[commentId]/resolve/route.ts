import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

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
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof (body as Record<string, unknown>).unresolve === "boolean") {
      unresolve = (body as Record<string, unknown>).unresolve as boolean;
    }
  } catch {
    // default to resolve
  }

  try {
    const result = await getPlatform().pullRequests.resolveComment(auth, owner, repo, cid, unresolve);
    return NextResponse.json({ success: true, resolved: result.resolved });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update comment state" },
      { status: 502 },
    );
  }
}
