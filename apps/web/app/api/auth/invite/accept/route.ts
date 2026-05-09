import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const parsedBody = await safeJson(request);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await getPlatform().invites.acceptInvite(
      parsed.data.token,
      parsed.data.password,
    );
    return NextResponse.json(result);
  } catch (err) {
    return handlePlatformError(err);
  }
}
