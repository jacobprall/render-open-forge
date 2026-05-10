import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, branch } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/branch-protection/${branch}`, userId);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, branch } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/branch-protection/${branch}`, userId);
}
