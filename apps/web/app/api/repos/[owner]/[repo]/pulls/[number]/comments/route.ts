import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch comments" },
      { status: 502 },
    );
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  try {
    const comment = await getPlatform().pullRequests.createComment(auth, owner, repo, n, {
      body: typeof b.body === "string" ? b.body : "",
      path: typeof b.path === "string" ? b.path : undefined,
      newLine: typeof b.new_line_num === "number" ? b.new_line_num : undefined,
      oldLine: typeof b.old_line_num === "number" ? b.old_line_num : undefined,
    });
    return NextResponse.json({ comment });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to post comment" },
      { status: 502 },
    );
  }
}
