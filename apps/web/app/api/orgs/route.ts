import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

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
  const { login, fullName, description } = body;
  if (!login) {
    return NextResponse.json({ error: "login is required" }, { status: 400 });
  }

  const forge = createForgeProvider(session.forgejoToken);
  const org = await forge.orgs.create(login, { fullName, description });
  return NextResponse.json(org, { status: 201 });
}
