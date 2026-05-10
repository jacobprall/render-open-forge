import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  return gatewayProxy(req, "/settings/access-tokens", userId);
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  return gatewayProxy(req, "/settings/access-tokens", userId);
}
