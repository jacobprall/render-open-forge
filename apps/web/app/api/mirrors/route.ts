import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const qs = req.nextUrl.search;
  return gatewayProxy(req, `/mirrors${qs}`, userId);
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  return gatewayProxy(req, "/mirrors", userId);
}
