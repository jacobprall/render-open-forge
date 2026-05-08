import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

export async function GET() {
  const auth = await requireAuth();

  try {
    const count = await getPlatform().inbox.countUnread(auth);
    return NextResponse.json({ count });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get count" },
      { status: 502 },
    );
  }
}
