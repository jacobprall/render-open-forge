import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; jobId: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, jobId } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, userId);
}
