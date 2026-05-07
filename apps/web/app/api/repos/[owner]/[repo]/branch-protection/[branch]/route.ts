import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import {
  forgeDeleteBranchProtection,
  forgeGetBranchProtection,
} from "@render-open-forge/shared/lib/forgejo/repo-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, branch } = await params;
  const decoded = decodeURIComponent(branch);
  const client = createForgejoClient(auth.forgejoToken);

  try {
    const protection = await forgeGetBranchProtection(client, owner, repo, decoded);
    if (!protection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ protection });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forgejo unreachable" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, branch } = await params;
  const decoded = decodeURIComponent(branch);
  const client = createForgejoClient(auth.forgejoToken);

  try {
    await forgeDeleteBranchProtection(client, owner, repo, decoded);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete branch protection" },
      { status: 502 },
    );
  }
}
