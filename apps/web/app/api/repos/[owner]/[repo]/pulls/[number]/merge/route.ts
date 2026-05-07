import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

const mergeModes = ["merge", "rebase", "squash"] as const;
type MergeMode = (typeof mergeModes)[number];

export async function POST(
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

  let mode: MergeMode | undefined;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const m = typeof body.method === "string" ? body.method.toLowerCase() : undefined;
      if (m && mergeModes.includes(m as MergeMode)) {
        mode = m as MergeMode;
      }
    }
  } catch {
    mode = undefined;
  }

  const forge = createForgeProvider(auth.forgejoToken);
  try {
    await forge.pulls.merge(owner, repo, n, mode ?? "merge");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Merge failed" },
      { status: 502 },
    );
  }
}
