import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";
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
    return handlePlatformError(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();

  const body = await parseJsonBody<{
    syncConnectionId: string;
    localRepoPath: string;
    remoteRepoUrl: string;
    direction: "pull" | "push" | "bidirectional";
    remoteToken?: string;
    sessionId?: string;
  }>(req);

  try {
    const mirror = await getPlatform().mirrors.create(auth, {
      syncConnectionId: body.syncConnectionId,
      localRepoPath: body.localRepoPath,
      remoteRepoUrl: body.remoteRepoUrl,
      direction: body.direction,
      remoteToken: body.remoteToken,
      sessionId: body.sessionId,
    });
    return NextResponse.json({ mirror }, { status: 201 });
  } catch (e) {
    return handlePlatformError(e);
  }
}
