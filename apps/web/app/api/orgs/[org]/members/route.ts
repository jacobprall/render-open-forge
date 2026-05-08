import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await requireAuth();
  const { org } = await params;

  try {
    const members = await getPlatform().orgs.listMembers(auth, org);
    return NextResponse.json(members);
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list members" },
      { status: 502 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await requireAuth();
  const { org } = await params;
  const { username } = await request.json();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  try {
    await getPlatform().orgs.addMember(auth, org, username);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add member" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await requireAuth();
  const { org } = await params;
  const { username } = await request.json();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }

  try {
    await getPlatform().orgs.removeMember(auth, org, username);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to remove member" },
      { status: 502 },
    );
  }
}
