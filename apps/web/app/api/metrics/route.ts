import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@openforge/platform/observability";
import { isAuthorizedObservabilityRequest } from "@/lib/api/observability-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorizedObservabilityRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = metrics.toPrometheus();
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
