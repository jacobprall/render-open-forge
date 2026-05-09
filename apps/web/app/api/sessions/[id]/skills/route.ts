import { NextRequest, NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
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

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data as { activeSkills?: unknown };
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
