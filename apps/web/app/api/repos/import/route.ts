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

  // Resolve auth token: use explicit auth_token, or look up from sync connection
  let authToken = body.auth_token;
  if (!authToken && body.sync_connection_id) {
    const db = getDb();
    const [conn] = await db
      .select({ accessToken: syncConnections.accessToken })
      .from(syncConnections)
      .where(eq(syncConnections.id, body.sync_connection_id))
      .limit(1);
    authToken = conn?.accessToken ?? undefined;
  }

  try {
    const repo = await forge.repos.migrate({
      cloneAddr: body.clone_addr,
      repoName: body.repo_name,
      repoOwner,
      mirror: body.mirror ?? false,
      service,
      authToken,
    });

    // Trigger an immediate mirror-sync so branches/commits are available right away
    if (body.mirror) {
      const [owner, repoName] = repo.fullName.split("/");
      if (owner && repoName) {
        const forgejoUrl = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
        const agentToken = process.env.FORGEJO_AGENT_TOKEN;
        if (agentToken) {
          fetch(`${forgejoUrl}/api/v1/repos/${owner}/${repoName}/mirror-sync`, {
            method: "POST",
            headers: { Authorization: `token ${agentToken}` },
          }).catch(() => {});
        }
      }
    }

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
