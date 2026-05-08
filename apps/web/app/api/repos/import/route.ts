import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, getPlatform } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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
  const auth = await requireAuth();

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

  try {
    const { repo, deferredTasks } = await getPlatform().repos.importRepo(auth, {
      cloneAddr: body.clone_addr,
      repoName: body.repo_name,
      repoOwner: body.repo_owner,
      mirror: body.mirror,
      service: body.service,
      authToken: body.auth_token,
      syncConnectionId: body.sync_connection_id,
    });

    for (const task of deferredTasks) {
      after(task);
    }

    return NextResponse.json({ repo }, { status: 201 });
  } catch (e) {
    if (isPlatformError(e)) {
      return NextResponse.json({ error: e.message }, { status: e.httpStatus });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration failed" },
      { status: 502 },
    );
  }
}
