import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

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
    return handlePlatformError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await requireAuth();
  const { owner, repo } = await params;

  const body = await parseJsonBody<Record<string, unknown>>(req);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  try {
    const pattern = (body.branch_name as string) ?? (body.branchName as string) ?? (body.rule_name as string) ?? (body.pattern as string) ?? "";
    const protection = await getPlatform().repos.setBranchProtection(auth, owner, repo, {
      pattern,
      name: (body.rule_name as string) ?? pattern,
      requiredApprovals: (body.required_approvals as number) ?? (body.requiredApprovals as number) ?? 0,
      requireStatusChecks: Boolean(body.enable_status_check ?? body.requireStatusChecks),
      statusCheckContexts: (body.status_check_contexts as string[]) ?? (body.statusCheckContexts as string[]) ?? [],
      blockForcePush: Boolean(body.block_on_rejection ?? body.blockForcePush),
      raw: body,
    });
    return NextResponse.json({ protection });
  } catch (e) {
    return handlePlatformError(e);
  }
}
