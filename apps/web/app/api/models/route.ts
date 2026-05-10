import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  return gatewayProxy(req, "/models", userId);
}
