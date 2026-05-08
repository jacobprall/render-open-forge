import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

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
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get file contents" },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  const { owner, repo, path } = await params;
  const filePath = path.join("/");
  const body = await request.json();

  try {
    const result = await getPlatform().repos.putFileContents(auth, owner, repo, filePath, {
      content: body.content,
      message: body.message,
      sha: body.sha,
      branch: body.branch,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to write file" },
      { status: 502 },
    );
  }
}
