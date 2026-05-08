import { NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform, requireAuth } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

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

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
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
    if (isPlatformError(err)) {
      const status = err.message.includes("encryption") ? 503 : err.httpStatus;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
