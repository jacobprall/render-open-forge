import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET() {
  const auth = await requireAuth();

  try {
    const count = await getPlatform().inbox.countUnread(auth);
    return NextResponse.json({ count });
  } catch (e) {
    return handlePlatformError(e);
  }
}
