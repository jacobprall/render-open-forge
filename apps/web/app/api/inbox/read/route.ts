import { NextRequest, NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data as { ids?: unknown; markAll?: boolean };
  const ids: string[] = Array.isArray(body.ids) ? (body.ids as string[]) : [];
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
