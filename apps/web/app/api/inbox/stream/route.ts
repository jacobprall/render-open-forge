import { gatewayStream, requireUserId } from "@/lib/gateway";

export async function GET() {
  const userId = await requireUserId();
  return gatewayStream("/stream/inbox", userId);
}
