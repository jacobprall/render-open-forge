import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string; commentId: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const forge = createForgeProvider(auth.forgejoToken);
  try {
    if (unresolve) {
      await forge.reviews.unresolveComment(owner, repo, cid);
    } else {
      await forge.reviews.resolveComment(owner, repo, cid);
    }
    return NextResponse.json({ success: true, resolved: !unresolve });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update comment state" },
      { status: 502 },
    );
  }
}
