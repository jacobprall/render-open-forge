import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo } = await params;

  try {
    const result = await getPlatform().repos.getAgentConfig(auth, owner, repo);
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo } = await params;

  const body = await parseJsonBody<{ content: string; path?: string; sha?: string; message?: string; branch?: string }>(req);

  try {
    const result = await getPlatform().repos.writeAgentConfig(auth, owner, repo, {
      content: body.content,
      path: body.path,
      sha: body.sha,
      message: body.message,
      branch: body.branch,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}
