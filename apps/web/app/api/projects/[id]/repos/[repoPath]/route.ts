import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; repoPath: string }> },
) {
  const auth = await requireAuth();
  const { id, repoPath } = await params;
  try {
    await getPlatform().projects.removeRepo(auth, id, decodeURIComponent(repoPath));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handlePlatformError(err);
  }
}
