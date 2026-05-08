import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, name } = await params;

  let body: { value?: string };
  try {
    body = (await req.json()) as { value?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await getPlatform().repos.setSecret(auth, owner, repo, name, body.value ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to set secret" },
      { status: 502 },
    );
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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete secret" },
      { status: 502 },
    );
  }
}
