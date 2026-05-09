import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const activeSkillRefSchema = z.object({
  source: z.enum(["builtin", "user", "repo"]),
  slug: z.string().min(1),
});

const createSessionBodySchema = z.object({
  repoPath: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  title: z.string().max(200).optional(),
  forgeType: z.enum(["forgejo", "github", "gitlab"]).optional(),
  activeSkills: z.array(activeSkillRefSchema).optional(),
  firstMessage: z.string().max(10000).optional(),
  modelId: z.string().optional(),
  projectId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = createSessionBodySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;
    const branch = data.repoPath ? (data.branch || data.baseBranch || "main") : undefined;
    const platform = getPlatform();

    let projectId = data.projectId;
    if (projectId) {
      const project = await platform.projects.get(auth, projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    } else if (data.repoPath) {
      const project = await platform.projects.findOrCreateForRepo(auth, data.repoPath, data.forgeType);
      projectId = project.id;
    } else {
      const scratch = await platform.projects.getScratchProject(auth);
      projectId = scratch.id;
    }

    const result = await platform.sessions.create(auth, {
      ...data,
      branch,
      projectId,
    });
    return NextResponse.json({ id: result.sessionId, ...result });
  } catch (err) {
    return handlePlatformError(err);
  }
}
