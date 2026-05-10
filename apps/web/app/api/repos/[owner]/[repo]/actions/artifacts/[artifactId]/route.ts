import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; artifactId: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, artifactId } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/actions/artifacts/${artifactId}`, userId);
}
