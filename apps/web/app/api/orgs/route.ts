import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

const createOrgBodySchema = z.object({
  login: z.string().min(1).max(40),
  fullName: z.string().max(255).optional(),
  description: z.string().max(4096).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forge = createForgeProvider(session.forgejoToken);
  const orgs = await forge.orgs.list();
  return NextResponse.json(orgs);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createOrgBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { login, fullName, description } = parsed.data;

  const forge = createForgeProvider(session.forgejoToken);
  const org = await forge.orgs.create(login, { fullName, description });
  return NextResponse.json(org, { status: 201 });
}
