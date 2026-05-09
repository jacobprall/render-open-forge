import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  try {
    const comments = await getPlatform().pullRequests.listComments(auth, owner, repo, n);
    return NextResponse.json({ comments });
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  const body = await parseJsonBody<Record<string, unknown>>(req);

  try {
    const comment = await getPlatform().pullRequests.createComment(auth, owner, repo, n, {
      body: typeof body.body === "string" ? body.body : "",
      path: typeof body.path === "string" ? body.path : undefined,
      newLine: typeof body.new_line_num === "number" ? body.new_line_num : undefined,
      oldLine: typeof body.old_line_num === "number" ? body.old_line_num : undefined,
    });
    return NextResponse.json({ comment });
  } catch (e) {
    return handlePlatformError(e);
  }
}
