import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const specActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  specId: z.string().min(1),
  rejectionNote: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id: sessionId }, auth] = await Promise.all([params, requireAuth()]);

  const body = await req.json();
  const parsed = specActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "action and specId required", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await getPlatform().sessions.handleSpecAction(auth, sessionId, parsed.data);
    return NextResponse.json({ success: true, runId: result.runId });
  } catch (err) {
    return handlePlatformError(err);
  }
}
