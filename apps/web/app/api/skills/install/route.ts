import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim() : undefined;

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const result = await getPlatform().skills.installSkill(auth, { url, name: slug });
    return NextResponse.json(result);
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to install skill" },
      { status: 422 },
    );
  }
}
