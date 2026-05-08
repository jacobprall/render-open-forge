import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createForgeProvider } from "@/lib/forgejo/client";
import { createMirror } from "@/lib/sync/mirror-engine";
import { syncConnections } from "@render-open-forge/db";
import { eq, and } from "drizzle-orm";
import { logger } from "@render-open-forge/shared";

const importRepoBodySchema = z.object({
  clone_addr: z.string().url(),
  repo_name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9-]+$/),
  repo_owner: z.string().optional(),
  mirror: z.boolean().optional(),
  service: z.enum(["git", "github", "gitlab", "gitea", "forgejo"]).optional(),
  auth_token: z.string().optional(),
  sync_connection_id: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importRepoBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const service = body.service;

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
          after(async () => {
            try {
              const res = await fetch(
                `${forgejoUrl}/api/v1/repos/${owner}/${repoName}/mirror-sync`,
                {
                  method: "POST",
                  headers: { Authorization: `token ${agentToken}` },
                },
              );
              if (!res.ok) {
                logger.error("mirror-sync failed after import", {
                  repo: repo.fullName,
                  status: res.status,
                });
              }
            } catch (err) {
              logger.errorWithCause(err, "mirror-sync failed after import", {
                repo: repo.fullName,
              });
            }
          });
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
        const userId = String(session.userId);
        const forgejoRepoPath = repo.fullName;
        const remoteRepoUrl = body.clone_addr;
        after(async () => {
          try {
            await createMirror(db, {
              userId,
              syncConnectionId: connectionId,
              forgejoRepoPath,
              remoteRepoUrl,
              direction: "pull",
            });
          } catch (err) {
            logger.errorWithCause(err, "createMirror failed after import", {
              repo: forgejoRepoPath,
            });
          }
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
