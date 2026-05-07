import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const forge = createForgeProvider(session.forgejoToken);
  await forge.orgs.delete(org);
  return new NextResponse(null, { status: 204 });
}
