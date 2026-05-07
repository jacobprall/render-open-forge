import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { deleteMirror, syncMirror, getMirrorIfOwned } from "@/lib/sync/mirror-engine";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const mirror = await getMirrorIfOwned(db, id, String(session.userId));
  if (!mirror) {
    return NextResponse.json({ error: "Mirror not found" }, { status: 404 });
  }

  try {
    await syncMirror(db, id);
    return NextResponse.json({ synced: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const mirror = await getMirrorIfOwned(db, id, String(session.userId));
  if (!mirror) {
    return NextResponse.json({ error: "Mirror not found" }, { status: 404 });
  }

  try {
    await deleteMirror(db, id);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
