import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function GET() {
  const userSession = await getSession();
  if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createForgejoClient(userSession.forgejoToken);
  const repos = await client.listUserRepos().catch(() => []);

  return NextResponse.json({ repos });
}
