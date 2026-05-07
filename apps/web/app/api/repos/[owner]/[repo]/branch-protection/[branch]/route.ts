import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, branch } = await params;
  const decoded = decodeURIComponent(branch);
  const forge = createForgeProvider(auth.forgejoToken);

  try {
    const protection = await forge.branches.getProtectionRule(owner, repo, decoded);
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
  const forge = createForgeProvider(auth.forgejoToken);

  try {
    await forge.branches.deleteProtectionRule(owner, repo, decoded);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete branch protection" },
      { status: 502 },
    );
  }
}
