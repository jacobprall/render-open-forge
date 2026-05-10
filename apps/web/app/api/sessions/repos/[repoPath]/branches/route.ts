import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ repoPath: string }> },
) {
  const userId = await requireUserId();
  const { repoPath } = await params;
  return gatewayProxy(req, `/sessions/repos/${repoPath}/branches`, userId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ repoPath: string }> },
) {
  const userId = await requireUserId();
  const { repoPath } = await params;
  return gatewayProxy(req, `/sessions/repos/${repoPath}/branches`, userId);
}
