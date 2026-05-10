import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string; commentId: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, number, commentId } = await params;
  return gatewayProxy(req, `/pulls/${owner}/${repo}/${number}/comments/${commentId}/resolve`, userId);
}
