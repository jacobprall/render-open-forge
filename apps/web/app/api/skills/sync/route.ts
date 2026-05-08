import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function POST() {
  const auth = await requireAuth();

  try {
    await getPlatform().skills.syncSkills(auth);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to sync skills" },
      { status: 502 },
    );
  }
}
