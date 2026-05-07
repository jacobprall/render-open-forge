import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo, number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) {
    return NextResponse.json({ error: "Invalid pull request number" }, { status: 400 });
  }

  let body: { state?: "open" | "closed"; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { state?: "open" | "closed"; title?: string } = {};
  if (body.state === "open" || body.state === "closed") patch.state = body.state;
  if (typeof body.title === "string" && body.title.trim().length > 0) {
    patch.title = body.title.trim();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid patch fields (state | title)" }, { status: 400 });
  }

  const client = createForgejoClient(auth.forgejoToken);
  try {
    const pr = await client.patchPullRequest(owner, repo, n, patch);
    return NextResponse.json({ pull_request: pr });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forgejo update failed" },
      { status: 502 },
    );
  }
}
