import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const phaseBodySchema = z.object({
  phase: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  const body = await req.json();
  const parsed = phaseBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  }

  try {
    await getPlatform().sessions.updatePhase(auth, id, parsed.data.phase);
    return NextResponse.json({ success: true, phase: parsed.data.phase });
  } catch (err) {
    return handlePlatformError(err);
  }
}
