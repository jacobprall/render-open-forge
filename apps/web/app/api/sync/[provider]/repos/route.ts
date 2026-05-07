import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { syncConnections } from "@render-open-forge/db";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getValidGitHubToken } from "@/lib/sync/github";
import { listGitHubRepos } from "@/lib/sync/github";
import { getValidGitLabToken, listGitLabRepos } from "@/lib/sync/gitlab";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = await params;
  if (provider !== "github" && provider !== "gitlab") {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const db = getDb();
  const userId = String(session.userId);

  const [connection] = await db
    .select()
    .from(syncConnections)
    .where(and(eq(syncConnections.userId, userId), eq(syncConnections.provider, provider)))
    .limit(1);

  if (!connection) {
    return NextResponse.json(
      { error: `No ${provider} connection found. Connect via Settings first.` },
      { status: 404 },
    );
  }

  try {
    let token: string | null;
    if (provider === "github") {
      token = await getValidGitHubToken(db, connection.id);
    } else {
      token = await getValidGitLabToken(db, connection.id);
    }

    if (!token) {
      return NextResponse.json(
        { error: `${provider} token expired. Reconnect via Settings.` },
        { status: 401 },
      );
    }

    const repos =
      provider === "github"
        ? await listGitHubRepos(token)
        : await listGitLabRepos(token);

    return NextResponse.json({ repos, connectionId: connection.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list repos" },
      { status: 502 },
    );
  }
}
