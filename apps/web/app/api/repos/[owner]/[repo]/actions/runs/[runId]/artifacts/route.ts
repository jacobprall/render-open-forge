import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, runId } = await params;

  try {
    const artifacts = await getPlatform().repos.listArtifacts(auth, owner, repo, runId);
    return NextResponse.json({ artifacts });
  } catch (e) {
    return handlePlatformError(e);
  }
}
