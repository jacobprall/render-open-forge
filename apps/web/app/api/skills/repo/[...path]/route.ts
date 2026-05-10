import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const userId = await requireUserId();
  const { path } = await params;
  const qs = req.nextUrl.search;
  return gatewayProxy(req, `/skills/repo/${path.join("/")}${qs}`, userId);
}
