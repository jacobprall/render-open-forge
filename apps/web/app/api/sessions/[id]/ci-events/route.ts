import { NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  try {
    const events = await getPlatform().sessions.listCiEvents(auth, id);
    return NextResponse.json({ events });
  } catch (err) {
    return handlePlatformError(err);
  }
}
