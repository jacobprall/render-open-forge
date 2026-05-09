import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

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
    return handlePlatformError(e);
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
    return handlePlatformError(e);
  }
}
