export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { gatewayStream, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; runId: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, runId } = await params;
  const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
  return gatewayStream(`/stream/repos/${owner}/${repo}/actions/runs/${runId}/logs?jobId=${jobId}`, userId);
}
