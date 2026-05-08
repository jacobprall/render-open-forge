import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

const postMessageBodySchema = z.object({
  content: z.string().min(1).max(100_000),
  modelId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  const body = await req.json();
  const parsed = postMessageBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const requestId = req.headers.get("x-request-id") ?? undefined;
    const result = await getPlatform().sessions.sendMessage(auth, id, {
      content: parsed.data.content,
      modelId: parsed.data.modelId,
      requestId,
    });

    if (result.isFirstMessage) {
      after(async () => {
        try {
          await getPlatform().sessions.generateAutoTitle(id, auth.userId);
        } catch (err) {
          console.error("[auto-title] Failed:", err);
        }
      });
    }

    return NextResponse.json({ success: true, messageId: result.messageId, runId: result.runId });
  } catch (err) {
    if (err instanceof Response) throw err;
    if (isPlatformError(err)) {
      const details = "details" in err ? (err as Record<string, unknown>).details : undefined;
      return NextResponse.json({ error: err.message, ...(details ? { details } : {}) }, { status: err.httpStatus });
    }
    throw err;
  }
}
