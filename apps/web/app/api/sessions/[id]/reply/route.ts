import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const replyBodySchema = z.object({
  toolCallId: z.string().min(1),
  message: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  runId: z.string().optional(),
}).refine(
  (d) => Boolean(d.message?.trim() || d.answer?.trim()),
  { message: "toolCallId and message required" },
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id: sessionId }, auth] = await Promise.all([params, requireAuth()]);

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = replyBodySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "toolCallId and message required" },
      { status: 400 },
    );
  }

  const { toolCallId, message, answer, runId } = parsed.data;

  try {
    await getPlatform().sessions.reply(auth, sessionId, {
      toolCallId,
      message: (message ?? answer)!,
      runId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handlePlatformError(err);
  }
}
