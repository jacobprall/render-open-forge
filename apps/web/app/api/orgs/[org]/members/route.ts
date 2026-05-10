import { type NextRequest } from "next/server";
import { gatewayProxy, requireUserId } from "@/lib/gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ org: string }> },
) {
  const userId = await requireUserId();
  const { org } = await params;
  const qs = req.nextUrl.search;
  return gatewayProxy(req, `/orgs/${org}/members${qs}`, userId);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ org: string }> },
) {
  const userId = await requireUserId();
  const { org } = await params;
  return gatewayProxy(req, `/orgs/${org}/members`, userId);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ org: string }> },
) {
  const userId = await requireUserId();
  const { org } = await params;
  return gatewayProxy(req, `/orgs/${org}/members`, userId);
}
