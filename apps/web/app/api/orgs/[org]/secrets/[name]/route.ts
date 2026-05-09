import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

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
    return handlePlatformError(e);
  }
}
