import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo } = await params;
  const forge = createForgeProvider(auth.forgejoToken);

  try {
    const protections = await forge.branches.listProtectionRules(owner, repo);
    return NextResponse.json({ protections });
  } catch (e) {
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
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const forge = createForgeProvider(auth.forgejoToken);

  try {
    const b = body as Record<string, unknown>;
    const pattern = (b.branch_name as string) ?? (b.rule_name as string) ?? (b.pattern as string) ?? "";
    const protection = await forge.branches.setProtectionRule(owner, repo, {
      pattern,
      name: (b.rule_name as string) ?? pattern,
      requiredApprovals: (b.required_approvals as number) ?? 0,
      requireStatusChecks: Boolean(b.enable_status_check),
      statusCheckContexts: (b.status_check_contexts as string[]) ?? [],
      blockForcePush: Boolean(b.block_on_rejection),
      raw: b,
    });
    return NextResponse.json({ protection });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save branch protection" },
      { status: 502 },
    );
  }
}
