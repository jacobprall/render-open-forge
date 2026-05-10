import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await gatewayFetch("/webhooks/gitlab", {
    method: "POST",
    body,
    headers: {
      "Content-Type": req.headers.get("Content-Type") ?? "application/json",
      "x-gitlab-token": req.headers.get("x-gitlab-token") ?? "",
      "x-gitlab-event": req.headers.get("x-gitlab-event") ?? "",
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
