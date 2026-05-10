import type { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; repoPath: string }> },
) {
  const userId = await requireUserId();
  const { id, repoPath } = await params;
  return gatewayProxy(req, `/projects/${id}/repos/${encodeURIComponent(repoPath)}`, userId);
}
