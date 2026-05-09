import { NextRequest, NextResponse } from "next/server";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const body = parsedBody.data as { url?: unknown; slug?: unknown };
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim() : undefined;

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const result = await getPlatform().skills.installSkill(auth, { url, name: slug });
    return NextResponse.json(result);
  } catch (e) {
    return handlePlatformError(e);
  }
}
