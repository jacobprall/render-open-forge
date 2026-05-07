import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgejoClient } from "@/lib/forgejo/client";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = createForgejoClient(session.forgejoToken);
  const orgs = await client.listUserOrgs();
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

  const client = createForgejoClient(session.forgejoToken);
  const org = await client.createOrg(login, { full_name: fullName, description });
  return NextResponse.json(org, { status: 201 });
}
