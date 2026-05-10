import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await gatewayFetch("/webhooks/forgejo", {
    method: "POST",
    body,
    headers: {
      "Content-Type": req.headers.get("Content-Type") ?? "application/json",
      "x-forgejo-signature": req.headers.get("x-forgejo-signature") ?? "",
      "x-gitea-signature": req.headers.get("x-gitea-signature") ?? "",
      "x-forgejo-event": req.headers.get("x-forgejo-event") ?? "",
      "x-gitea-event": req.headers.get("x-gitea-event") ?? "",
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
