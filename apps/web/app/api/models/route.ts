import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/platform";
import { gatewayFetch } from "@/lib/gateway";

export async function GET() {
  await requireAuth();

  const res = await gatewayFetch("/models");
  if (!res.ok) {
    const body = await res.text().catch(() => "Gateway error");
    return NextResponse.json({ models: [], error: body }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
