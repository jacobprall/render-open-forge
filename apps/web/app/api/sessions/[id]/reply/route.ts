import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

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

  const body = await req.json();
  const parsed = replyBodySchema.safeParse(body);
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
    if (err instanceof Response) throw err;
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    throw err;
  }
}
