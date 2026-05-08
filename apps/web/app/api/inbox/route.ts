import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";
import { paginationSchema } from "@/lib/api/pagination";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();

  const url = req.nextUrl;
  const filter = url.searchParams.get("filter") ?? "unread";

  const paginationParsed = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!paginationParsed.success) {
    return NextResponse.json(
      { error: "Invalid pagination", details: paginationParsed.error.flatten() },
      { status: 400 },
    );
  }
  const params = paginationParsed.data;

  try {
    const result = await getPlatform().inbox.list(auth, {
      filter: filter as "unread" | "action_needed" | "all",
      limit: params.limit,
      offset: params.offset,
    });

    return NextResponse.json({
      items: result.items,
      data: result.items,
      pagination: {
        limit: params.limit,
        offset: params.offset,
        hasMore: result.hasMore,
      },
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch inbox" },
      { status: 502 },
    );
  }
}
