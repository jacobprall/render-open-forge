import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json([]);

  const forge = createForgeProvider(session.forgeToken, session.forgeType);
  const repos = await forge.repos.search(q, 20);
  return NextResponse.json(repos);
}
