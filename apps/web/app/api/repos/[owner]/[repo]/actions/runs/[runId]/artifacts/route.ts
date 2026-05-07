import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, runId } = await params;
  const forge = createForgeProvider(auth.forgejoToken);

  try {
    const artifacts = await forge.ci.listArtifacts(owner, repo, runId);
    return NextResponse.json({ artifacts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch artifacts" },
      { status: 502 },
    );
  }
}
