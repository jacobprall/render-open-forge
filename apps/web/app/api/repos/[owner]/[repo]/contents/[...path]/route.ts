import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, path } = await params;
  const filePath = path.join("/");
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") || undefined;

  const client = createForgejoClient(session.forgejoToken);
  const file = await client.getContents(owner, repo, filePath, ref);
  return NextResponse.json(file);
}

export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, path } = await params;
  const filePath = path.join("/");
  const body = await request.json();
  const { content, message, sha, branch } = body;

  if (!content && content !== "") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const client = createForgejoClient(session.forgejoToken);
  const result = await client.updateFileContent(owner, repo, filePath, {
    content,
    message,
    sha,
    branch,
  });
  return NextResponse.json(result);
}
