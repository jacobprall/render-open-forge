import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ org: string; name: string }> },
) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org, name } = await params;
  const client = createForgejoClient(auth.forgejoToken);

  try {
    await client.deleteOrgSecret(org, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete org secret" },
      { status: 502 },
    );
  }
}
