import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list org secrets" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const auth = await requireAuth();
  const { org } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create org secret" },
      { status: 502 },
    );
  }
}
