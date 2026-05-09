import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const auth = await requireAuth();
  const { path } = await params;

  if (path.length < 2) {
    return NextResponse.json({ error: "Invalid repo path" }, { status: 400 });
  }

  const [owner, repo] = path;

  try {
    const result = await getPlatform().skills.listRepoSkills(auth, owner, repo);
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}
