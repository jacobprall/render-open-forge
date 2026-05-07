import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createForgeProvider } from "@/lib/forgejo/client";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    clone_addr: string;
    repo_name: string;
    repo_owner?: string;
    mirror?: boolean;
    service?: string;
    auth_token?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.clone_addr || !body.repo_name) {
    return NextResponse.json(
      { error: "Missing required fields: clone_addr, repo_name" },
      { status: 400 },
    );
  }

  const validServices = ["git", "github", "gitlab", "gitea", "forgejo"] as const;
  type ServiceType = typeof validServices[number];
  const service = validServices.includes(body.service as ServiceType) ? (body.service as ServiceType) : undefined;

  const forge = createForgeProvider(session.forgejoToken);

  try {
    const repo = await forge.repos.migrate({
      cloneAddr: body.clone_addr,
      repoName: body.repo_name,
      repoOwner: body.repo_owner ?? session.username,
      mirror: body.mirror ?? false,
      service,
      authToken: body.auth_token,
    });
    return NextResponse.json({ repo }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration failed" },
      { status: 502 },
    );
  }
}
