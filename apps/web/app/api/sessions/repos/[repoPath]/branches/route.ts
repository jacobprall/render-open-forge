import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ repoPath: string }> },
) {
  const { repoPath } = await params;
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = decodeURIComponent(repoPath);
  const [owner, repo] = decoded.split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "Invalid repo path" }, { status: 400 });
  }

  const forge = createForgeProvider(userSession.forgeToken, userSession.forgeType);
  const branches = await forge.branches.list(owner, repo).catch(() => []);

  return NextResponse.json({ branches });
}
