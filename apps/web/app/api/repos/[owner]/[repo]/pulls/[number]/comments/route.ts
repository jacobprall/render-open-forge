import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import {
  listPRComments,
  addInlineComment,
} from "@render-open-forge/shared/lib/forgejo/review-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  const client = createForgejoClient(auth.forgejoToken);
  try {
    const comments = await listPRComments(client, owner, repo, n);
    return NextResponse.json({ comments });
  } catch (e) {
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
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const text = typeof b.body === "string" ? b.body.trim() : "";
  const path = typeof b.path === "string" ? b.path : undefined;

  if (!text) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const client = createForgejoClient(auth.forgejoToken);
  try {
    if (path) {
      const newLine = typeof b.new_line_num === "number" ? b.new_line_num : undefined;
      const oldLine = typeof b.old_line_num === "number" ? b.old_line_num : undefined;
      const comment = await addInlineComment(client, owner, repo, n, path, text, newLine, oldLine);
      return NextResponse.json({ comment });
    }
    const result = await client.createIssueComment(owner, repo, n, text);
    return NextResponse.json({ comment: result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to post comment" },
      { status: 502 },
    );
  }
}
