import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/branch-protection`, userId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const userId = await requireUserId();
  const { owner, repo } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/branch-protection`, userId);
}
