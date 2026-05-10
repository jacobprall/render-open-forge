import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await gatewayFetch("/webhooks/github", {
    method: "POST",
    body,
    headers: {
      "Content-Type": req.headers.get("Content-Type") ?? "application/json",
      "x-hub-signature-256": req.headers.get("x-hub-signature-256") ?? "",
      "x-github-event": req.headers.get("x-github-event") ?? "",
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
