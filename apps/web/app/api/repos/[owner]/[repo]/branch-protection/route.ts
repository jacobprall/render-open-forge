import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo } = await params;

  try {
    const protections = await getPlatform().repos.listBranchProtections(auth, owner, repo);
    return NextResponse.json({ protections });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forgejo unreachable" },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  try {
    const b = body as Record<string, unknown>;
    const pattern = (b.branch_name as string) ?? (b.branchName as string) ?? (b.rule_name as string) ?? (b.pattern as string) ?? "";
    const protection = await getPlatform().repos.setBranchProtection(auth, owner, repo, {
      pattern,
      name: (b.rule_name as string) ?? pattern,
      requiredApprovals: (b.required_approvals as number) ?? (b.requiredApprovals as number) ?? 0,
      requireStatusChecks: Boolean(b.enable_status_check ?? b.requireStatusChecks),
      statusCheckContexts: (b.status_check_contexts as string[]) ?? (b.statusCheckContexts as string[]) ?? [],
      blockForcePush: Boolean(b.block_on_rejection ?? b.blockForcePush),
      raw: b,
    });
    return NextResponse.json({ protection });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save branch protection" },
      { status: 502 },
    );
  }
}
