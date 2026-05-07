import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const forge = createForgeProvider(auth.forgejoToken);

  try {
    const secrets = await forge.orgs.secrets.list(org);
    return NextResponse.json({ secrets });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list org secrets" },
      { status: 502 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const { name, value } = (await req.json()) as { name: string; value: string };
  if (!name || !value) {
    return NextResponse.json({ error: "name and value required" }, { status: 400 });
  }

  const forge = createForgeProvider(auth.forgejoToken);
  try {
    await forge.orgs.secrets.set(org, name, value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create org secret" },
      { status: 502 },
    );
  }
}
