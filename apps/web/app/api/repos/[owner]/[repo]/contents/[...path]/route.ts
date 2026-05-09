import { NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  const { owner, repo, path } = await params;
  const filePath = path.join("/");
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") || undefined;

  try {
    const file = await getPlatform().repos.getFileContents(auth, owner, repo, filePath, ref);
    return NextResponse.json(file);
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  const { owner, repo, path } = await params;
  const filePath = path.join("/");
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data as {
    content?: string;
    message?: string;
    sha?: string;
    branch?: string;
  };

  try {
    const result = await getPlatform().repos.putFileContents(auth, owner, repo, filePath, {
      content: body.content ?? "",
      message: body.message ?? "",
      sha: body.sha,
      branch: body.branch,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}
