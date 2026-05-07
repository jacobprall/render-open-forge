import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createForgeProvider } from "@/lib/forgejo/client";
import { createMirror } from "@/lib/sync/mirror-engine";
import { syncConnections } from "@render-open-forge/db";
import { eq, and } from "drizzle-orm";

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
    sync_connection_id?: string;
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
  type ServiceType = (typeof validServices)[number];
  const service = validServices.includes(body.service as ServiceType)
    ? (body.service as ServiceType)
    : undefined;

  const forge = createForgeProvider(session.forgejoToken);
  const repoOwner = body.repo_owner ?? session.username;

  try {
    const repo = await forge.repos.migrate({
      cloneAddr: body.clone_addr,
      repoName: body.repo_name,
      repoOwner,
      mirror: body.mirror ?? false,
      service,
      authToken: body.auth_token,
    });

    // If this import was from a connected external provider, create a mirror
    // row so the sync engine tracks it and webhook forwarding works.
    if (body.mirror && service && ["github", "gitlab"].includes(service)) {
      const db = getDb();
      const provider = service as "github" | "gitlab";

      // Find the user's sync connection for this provider
      let connectionId = body.sync_connection_id;
      if (!connectionId) {
        const [conn] = await db
          .select({ id: syncConnections.id })
          .from(syncConnections)
          .where(
            and(
              eq(syncConnections.userId, String(session.userId)),
              eq(syncConnections.provider, provider),
            ),
          )
          .limit(1);
        connectionId = conn?.id;
      }

      if (connectionId) {
        await createMirror(db, {
          userId: String(session.userId),
          syncConnectionId: connectionId,
          forgejoRepoPath: repo.fullName,
          remoteRepoUrl: body.clone_addr,
          direction: "pull",
        }).catch(() => {
          // Mirror creation is best-effort during import.
          // The repo is already imported at this point.
        });
      }
    }

    return NextResponse.json({ repo }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration failed" },
      { status: 502 },
    );
  }
}
