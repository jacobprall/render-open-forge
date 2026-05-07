import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const forge = createForgeProvider(session.forgejoToken);
  const members = await forge.orgs.listMembers(org);
  return NextResponse.json(members);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const { username } = await request.json();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const forge = createForgeProvider(session.forgejoToken);
  await forge.orgs.addMember(org, username);
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org } = await params;
  const { username } = await request.json();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  const forge = createForgeProvider(session.forgejoToken);
  await forge.orgs.removeMember(org, username);
  return new NextResponse(null, { status: 204 });
}
