import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
});

export async function GET() {
  await requireAuth();
  try {
    const org = await getPlatform().orgs.getPlatformOrg();
    if (!org) {
      return NextResponse.json({ error: "Organization not configured" }, { status: 404 });
    }
    return NextResponse.json(org);
  } catch (err) {
    return handlePlatformError(err);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = updateOrgSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const org = await getPlatform().orgs.updatePlatformOrg(auth, parsed.data);
    return NextResponse.json(org);
  } catch (err) {
    return handlePlatformError(err);
  }
}
