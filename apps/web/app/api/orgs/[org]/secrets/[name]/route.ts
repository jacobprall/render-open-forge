import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ org: string; name: string }> },
) {
  const auth = await requireAuth();
  const { org, name } = await params;

  try {
    await getPlatform().orgs.deleteSecret(auth, org, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete org secret" },
      { status: 502 },
    );
  }
}
