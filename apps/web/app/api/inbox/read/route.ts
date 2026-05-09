import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const body = await req.json();
  const ids: string[] = body.ids;
  const markAll: boolean = body.markAll === true;

  if (!markAll && (!Array.isArray(ids) || ids.length === 0)) {
    return NextResponse.json({ error: "ids array or markAll required" }, { status: 400 });
  }

  try {
    await getPlatform().inbox.markRead(auth, { ids, markAll });
    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
