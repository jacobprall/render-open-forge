import { NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const createOrgBodySchema = z.object({
  login: z.string().min(1).max(40),
  fullName: z.string().max(255).optional(),
  description: z.string().max(4096).optional(),
});

export async function GET() {
  const auth = await requireAuth();

  try {
    const orgs = await getPlatform().orgs.listOrgs(auth);
    return NextResponse.json(orgs);
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = createOrgBodySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const org = await getPlatform().orgs.createOrg(auth, parsed.data);
    return NextResponse.json(org, { status: 201 });
  } catch (e) {
    return handlePlatformError(e);
  }
}
