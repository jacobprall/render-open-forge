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
  repoPath: z.string().min(1),
  branch: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  title: z.string().max(200).optional(),
  activeSkills: z.array(activeSkillRefSchema).optional(),
  firstMessage: z.string().max(10000).optional(),
  modelId: z.string().optional(),
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
    const branch = data.branch || data.baseBranch || "main";
    const result = await getPlatform().sessions.create(auth, {
      ...data,
      branch,
    });
    return NextResponse.json({ id: result.sessionId, ...result });
  } catch (err) {
    return handlePlatformError(err);
  }
}
