import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list secrets" },
      { status: 502 },
    );
  }
}
