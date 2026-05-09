import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, name } = await params;

  const body = await parseJsonBody<{ value?: string }>(req);

  try {
    await getPlatform().repos.setSecret(auth, owner, repo, name, body.value ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, name } = await params;

  try {
    await getPlatform().repos.deleteSecret(auth, owner, repo, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
