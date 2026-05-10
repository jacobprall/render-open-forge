import { NextRequest } from "next/server";
import { gatewayStream, requireUserId } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  const { id } = await params;
  const lastEventId = req.headers.get("Last-Event-ID") ?? undefined;
  return gatewayStream(`/stream/sessions/${id}`, userId, { lastEventId });
}
