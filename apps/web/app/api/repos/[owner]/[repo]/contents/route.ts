import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAuth();
  const { owner, repo } = await params;
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") || undefined;

  try {
    const listing = await getPlatform().repos.getFileContents(auth, owner, repo, "", ref);
    return NextResponse.json(listing);
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list directory" },
      { status: 502 },
    );
  }
}
