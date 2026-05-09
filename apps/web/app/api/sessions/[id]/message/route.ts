import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const postMessageBodySchema = z.object({
  content: z.string().min(1).max(100_000),
  modelId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = postMessageBodySchema.safeParse(parsedBody.data);
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
    return handlePlatformError(err);
  }
}
