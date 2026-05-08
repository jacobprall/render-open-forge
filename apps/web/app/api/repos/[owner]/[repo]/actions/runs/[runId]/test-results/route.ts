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
    const result = await getPlatform().repos.getTestResults(auth, owner, repo, runId);
    return NextResponse.json(result);
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get test results" },
      { status: 502 },
    );
  }
}
