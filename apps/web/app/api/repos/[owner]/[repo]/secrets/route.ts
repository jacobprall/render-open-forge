import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo } = await params;

  try {
    const secrets = await getPlatform().repos.listSecrets(auth, owner, repo);
    return NextResponse.json({ secrets });
  } catch (e) {
    return handlePlatformError(e);
  }
}
