import { NextResponse } from "next/server";
import { metrics } from "@render-open-forge/platform/observability";

export async function GET() {
  const body = metrics.toPrometheus();
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
