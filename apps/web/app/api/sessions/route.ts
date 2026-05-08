import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

const activeSkillRefSchema = z.object({
  source: z.enum(["builtin", "user", "repo"]),
  slug: z.string().min(1),
});

const createSessionBodySchema = z.object({
  repoPath: z.string().min(1),
  branch: z.string().min(1),
  title: z.string().max(200).optional(),
  activeSkills: z.array(activeSkillRefSchema).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();

  const body = await req.json();
  const parsed = createSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await getPlatform().sessions.create(auth, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) throw err;
    if (isPlatformError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    throw err;
  }
}
