import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";
import {
  forgeListBranchProtections,
  forgeSetBranchProtection,
} from "@render-open-forge/shared/lib/forgejo/repo-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { owner, repo } = await params;
  const client = createForgejoClient(auth.forgejoToken);

  try {
    const protections = await forgeListBranchProtections(client, owner, repo);
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

  const client = createForgejoClient(auth.forgejoToken);

  try {
    const protection = await forgeSetBranchProtection(
      client,
      owner,
      repo,
      body as Record<string, unknown>,
    );
    return NextResponse.json({ protection });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save branch protection" },
      { status: 502 },
    );
  }
}
