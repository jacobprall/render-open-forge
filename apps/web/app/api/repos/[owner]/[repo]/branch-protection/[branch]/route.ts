import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, branch } = await params;
  const decoded = decodeURIComponent(branch);

  try {
    const protection = await getPlatform().repos.getBranchProtection(auth, owner, repo, decoded);
    return NextResponse.json({ protection });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forgejo unreachable" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, branch } = await params;
  const decoded = decodeURIComponent(branch);

  try {
    await getPlatform().repos.deleteBranchProtection(auth, owner, repo, decoded);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete branch protection" },
      { status: 502 },
    );
  }
}
