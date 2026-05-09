import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  instructions: z.string().max(10000).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  repoPath: z.string().min(1).optional(),
  forgeType: z.enum(["forgejo", "github", "gitlab"]).optional(),
});

export async function GET() {
  const auth = await requireAuth();
  try {
    const projects = await getPlatform().projects.list(auth);
    return NextResponse.json(projects);
  } catch (err) {
    return handlePlatformError(err);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = createProjectSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const project = await getPlatform().projects.create(auth, parsed.data);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return handlePlatformError(err);
  }
}
