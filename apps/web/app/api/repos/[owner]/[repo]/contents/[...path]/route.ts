import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> },
) {
  const userId = await requireUserId();
  const { owner, repo, path } = await params;
  const qs = req.nextUrl.search;
  return gatewayProxy(req, `/repos/${owner}/${repo}/contents/${path.join("/")}${qs}`, userId);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; path: string[] }> },
) {
  const userId = await requireUserId();
  const { owner, repo, path } = await params;
  return gatewayProxy(req, `/repos/${owner}/${repo}/contents/${path.join("/")}`, userId);
}
