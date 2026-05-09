import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatform } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
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
