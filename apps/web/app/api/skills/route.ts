import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();

  const repo = req.nextUrl.searchParams.get("repo") ?? undefined;

  try {
    const result = await getPlatform().skills.listSkills(auth, repo);
    return NextResponse.json(result);
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list skills" },
      { status: 502 },
    );
  }
}
