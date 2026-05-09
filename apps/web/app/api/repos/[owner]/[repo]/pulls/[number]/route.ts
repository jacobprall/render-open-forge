import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  const body = await parseJsonBody<{ state?: "open" | "closed"; title?: string }>(req);

  try {
    const pr = await getPlatform().pullRequests.updatePullRequest(auth, owner, repo, n, {
      state: body.state,
      title: body.title,
    });
    return NextResponse.json({ pull_request: pr });
  } catch (e) {
    return handlePlatformError(e);
  }
}
