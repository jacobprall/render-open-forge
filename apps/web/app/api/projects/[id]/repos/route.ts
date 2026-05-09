import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const addRepoSchema = z.object({
  repoPath: z.string().min(1),
  forgeType: z.enum(["forgejo", "github", "gitlab"]).optional(),
  defaultBranch: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = addRepoSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const repo = await getPlatform().projects.addRepo(auth, id, parsed.data);
    return NextResponse.json(repo, { status: 201 });
  } catch (err) {
    return handlePlatformError(err);
  }
}
