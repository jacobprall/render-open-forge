import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";
import { paginationSchema, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();

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

  try {
    const rows = await getPlatform().mirrors.list(auth, {
      limit: params.limit,
      offset: params.offset,
    });
    const page = paginatedResponse(rows, params);
    return NextResponse.json({
      mirrors: page.data,
      data: page.data,
      pagination: page.pagination,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list mirrors" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();

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

  try {
    const mirror = await getPlatform().mirrors.create(auth, {
      syncConnectionId: body.syncConnectionId,
      forgejoRepoPath: body.forgejoRepoPath,
      remoteRepoUrl: body.remoteRepoUrl,
      direction: body.direction,
      remoteToken: body.remoteToken,
      sessionId: body.sessionId,
    });
    return NextResponse.json({ mirror }, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(e.toJSON(), { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create mirror" },
      { status: 500 },
    );
  }
}
