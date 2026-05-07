import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const client = createForgejoClient(session.forgejoToken);
  await client.deleteOrg(org);
  return new NextResponse(null, { status: 204 });
}
