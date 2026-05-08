import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function GET() {
  const auth = await requireAuth();

  try {
    const count = await getPlatform().inbox.countUnread(auth);
    return NextResponse.json({ count });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get count" },
      { status: 502 },
    );
  }
}
