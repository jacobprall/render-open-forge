import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; artifactId: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, artifactId } = await params;

  try {
    const data = await getPlatform().repos.downloadArtifact(auth, owner, repo, artifactId);
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="artifact-${artifactId}"`,
      },
    });
  } catch (e) {
    return handlePlatformError(e);
  }
}
