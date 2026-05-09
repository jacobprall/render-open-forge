import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, getPlatform } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

const postBodySchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const auth = await requireAuth();
  const { org } = await params;

  try {
    const secrets = await getPlatform().orgs.listSecrets(auth, org);
    return NextResponse.json({ secrets });
  } catch (e) {
    return handlePlatformError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const auth = await requireAuth();
  const { org } = await params;

  const body = await parseJsonBody(req);

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await getPlatform().orgs.setSecret(auth, org, parsed.data.name, parsed.data.value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handlePlatformError(e);
  }
}
