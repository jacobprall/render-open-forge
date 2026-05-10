import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await gatewayFetch("/webhooks/render", {
    method: "POST",
    body,
    headers: {
      "Content-Type": req.headers.get("Content-Type") ?? "application/json",
      "render-signature": req.headers.get("render-signature") ?? "",
      "x-render-signature": req.headers.get("x-render-signature") ?? "",
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
