import { NextResponse } from "next/server";
import { gatewayFetch } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await gatewayFetch("/ci/results", {
    method: "POST",
    body,
    headers: {
      "Content-Type": req.headers.get("Content-Type") ?? "application/json",
      "x-ci-secret": req.headers.get("x-ci-secret") ?? "",
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
