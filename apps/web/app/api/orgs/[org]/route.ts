import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await requireAuth();
  const { org } = await params;

  try {
    await getPlatform().orgs.deleteOrg(auth, org);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return handlePlatformError(e);
  }
}
