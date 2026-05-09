import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id } = await params;

    await getPlatform().mirrors.sync(auth, id);
    return NextResponse.json({ synced: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
