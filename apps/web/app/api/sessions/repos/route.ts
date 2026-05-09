import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forge/client";

export async function GET() {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forge = createForgeProvider(userSession.forgeToken, userSession.forgeType);
  const repos = await forge.repos.list().catch(() => []);

  return NextResponse.json({ repos });
}
