import { type NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ org: string }> },
) {
  const userId = await requireUserId();
  const { org } = await params;
  return gatewayProxy(req, `/orgs/${org}`, userId);
}
