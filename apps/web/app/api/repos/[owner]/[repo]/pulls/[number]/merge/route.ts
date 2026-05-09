import { NextRequest, NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";
import type { MergeMethod } from "@openforge/platform";

const mergeModes = ["merge", "rebase", "squash"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let mode: MergeMethod | undefined;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const parsedBody = await safeJson(req);
    if ("error" in parsedBody) {
      return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    }
    const body = parsedBody.data as { method?: unknown };
    const m =
      typeof body.method === "string" ? body.method.toLowerCase() : undefined;
    if (m && mergeModes.includes(m as (typeof mergeModes)[number])) {
      mode = m as MergeMethod;
    }
  }

  try {
    await getPlatform().pullRequests.mergePullRequest(auth, owner, repo, n, mode);
    return NextResponse.json({ success: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
