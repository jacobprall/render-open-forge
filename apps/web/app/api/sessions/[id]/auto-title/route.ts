import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  const result = await getPlatform().sessions.generateAutoTitle(id, auth.userId);

  if (!result.ok) {
    if (result.reason === "no-api-key") {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "No chat found" }, { status: 404 });
  }

  return NextResponse.json({ title: result.title });
}
