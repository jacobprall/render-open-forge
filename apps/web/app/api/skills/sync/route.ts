import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST() {
  const auth = await requireAuth();

  try {
    await getPlatform().skills.syncSkills(auth);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
