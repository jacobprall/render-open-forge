import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, name } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/secrets/${name}`, userId);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, name } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/secrets/${name}`, userId);
}
