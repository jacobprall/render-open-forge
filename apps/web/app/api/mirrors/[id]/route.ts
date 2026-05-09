import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  try {
    await getPlatform().mirrors.sync(auth, id);
    return NextResponse.json({ synced: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  try {
    await getPlatform().mirrors.delete(auth, id);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
