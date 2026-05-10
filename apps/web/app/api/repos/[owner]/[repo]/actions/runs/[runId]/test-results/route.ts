import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, runId } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/actions/runs/${runId}/test-results`, userId);
}
