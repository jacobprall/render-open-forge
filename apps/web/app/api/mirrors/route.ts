import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createMirror, listMirrors } from "@/lib/sync/mirror-engine";
import { paginationSchema, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paginationParsed = paginationSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!paginationParsed.success) {
    return NextResponse.json(
      { error: "Invalid pagination", details: paginationParsed.error.flatten() },
      { status: 400 },
    );
  }
  const params = paginationParsed.data;

  const db = getDb();
  const rows = await listMirrors(db, String(session.userId), params);
  const page = paginatedResponse(rows, params);

  return NextResponse.json({
    mirrors: page.data,
    data: page.data,
    pagination: page.pagination,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    syncConnectionId: string;
    forgejoRepoPath: string;
    remoteRepoUrl: string;
    direction: "pull" | "push" | "bidirectional";
    remoteToken?: string;
    sessionId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.syncConnectionId || !body.forgejoRepoPath || !body.remoteRepoUrl || !body.direction) {
    return NextResponse.json(
      { error: "Missing required fields: syncConnectionId, forgejoRepoPath, remoteRepoUrl, direction" },
      { status: 400 },
    );
  }

  const validDirections = ["pull", "push", "bidirectional"] as const;
  if (!validDirections.includes(body.direction)) {
    return NextResponse.json(
      { error: `Invalid direction. Must be one of: ${validDirections.join(", ")}` },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    const mirror = await createMirror(db, {
      userId: String(session.userId),
      syncConnectionId: body.syncConnectionId,
      forgejoRepoPath: body.forgejoRepoPath,
      remoteRepoUrl: body.remoteRepoUrl,
      direction: body.direction,
      remoteToken: body.remoteToken,
      sessionId: body.sessionId,
    });
    return NextResponse.json({ mirror }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create mirror" },
      { status: 500 },
    );
  }
}
