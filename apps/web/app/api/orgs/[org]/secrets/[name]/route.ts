import { type NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; name: string }> },
) {
  const userId = await requireUserId();
  const { org, name } = await params;
  return gatewayProxy(req, `/orgs/${org}/secrets/${name}`, userId);
}
