import { NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const postSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  scope: z.enum(["platform", "user"]),
  label: z.string().min(1).max(120).optional(),
  apiKey: z.string().min(8),
});

export async function GET() {
  const auth = await requireAuth();
  const result = await getPlatform().settings.listApiKeys(auth);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAuth();

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = postSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await getPlatform().settings.createOrUpdateApiKey(auth, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return handlePlatformError(err);
  }
}
