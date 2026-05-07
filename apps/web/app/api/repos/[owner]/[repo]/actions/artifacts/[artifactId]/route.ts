import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; artifactId: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, artifactId } = await params;
  const client = createForgejoClient(auth.forgejoToken);

  try {
    const data = await client.downloadArtifact(owner, repo, artifactId);
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="artifact-${artifactId}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Download failed" },
      { status: 502 },
    );
  }
}
