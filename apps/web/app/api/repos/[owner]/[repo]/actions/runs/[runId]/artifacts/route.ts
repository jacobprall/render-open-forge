import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch artifacts" },
      { status: 502 },
    );
  }
}
