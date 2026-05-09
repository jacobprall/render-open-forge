import { NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET() {
  await requireAuth();
  try {
    const members = await getPlatform().orgs.listPlatformMembers();
    return NextResponse.json(members);
  } catch (err) {
    return handlePlatformError(err);
  }
}
