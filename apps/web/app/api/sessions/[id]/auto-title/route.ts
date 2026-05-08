import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { generateAutoTitle } from "@/lib/sessions/auto-title";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateAutoTitle(id, String(userSession.userId));

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
