import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list orgs" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth();

  const body = await request.json();
  const parsed = createOrgBodySchema.safeParse(body);
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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create org" },
      { status: 502 },
    );
  }
}
