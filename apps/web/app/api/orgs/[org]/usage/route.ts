import { NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await requireAuth();
  await params;

  try {
    const result = await getPlatform().orgs.getUsage(auth);
    return NextResponse.json(result);
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get usage" },
      { status: 502 },
    );
  }
}
