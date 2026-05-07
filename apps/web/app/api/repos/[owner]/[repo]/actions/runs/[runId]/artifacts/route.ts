import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, runId } = await params;
  const client = createForgejoClient(auth.forgejoToken);

  try {
    const artifacts = await client.listActionArtifacts(owner, repo, runId);
    return NextResponse.json({ artifacts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch artifacts" },
      { status: 502 },
    );
  }
}
