import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo, number } = await params;
  return gatewayProxy(req, `/pulls/${owner}/${repo}/${number}/merge`, userId);
}
