import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth();

  const params = paginationSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!params.success) {
    return NextResponse.json(
      { error: "Invalid pagination", details: params.error.flatten() },
      { status: 400 },
    );
  }

  const result = await getPlatform().notifications.list(auth, params.data);

  return NextResponse.json({
    notifications: result.notifications,
    data: result.notifications,
    pagination: { hasMore: result.hasMore },
  });
}
