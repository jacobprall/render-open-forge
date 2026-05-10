import { NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  const { id } = await params;
  return gatewayProxy(req, `/settings/access-tokens/${id}`, userId);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  const { id } = await params;
  return gatewayProxy(req, `/settings/access-tokens/${id}`, userId);
}
