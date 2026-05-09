import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();

  const repo = req.nextUrl.searchParams.get("repo") ?? undefined;

  try {
    const result = await getPlatform().skills.listSkills(auth, repo);
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}
