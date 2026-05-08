import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

export async function POST() {
  const auth = await requireAuth();

  try {
    await getPlatform().skills.syncSkills(auth);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to sync skills" },
      { status: 502 },
    );
  }
}
