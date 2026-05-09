import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  try {
    const result = await getPlatform().sessions.stop(auth, id);
    return NextResponse.json({ success: true, runId: result.runId });
  } catch (err) {
    return handlePlatformError(err);
  }
}
