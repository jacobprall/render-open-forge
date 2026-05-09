import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  try {
    const activeSkills = await getPlatform().sessions.getSkills(auth, id);
    return NextResponse.json({ activeSkills });
  } catch (err) {
    return handlePlatformError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  const body = await req.json();
  const activeSkills = body.activeSkills;
  if (!Array.isArray(activeSkills)) {
    return NextResponse.json({ error: "activeSkills array required" }, { status: 400 });
  }

  try {
    await getPlatform().sessions.updateSkills(auth, id, activeSkills);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handlePlatformError(err);
  }
}
