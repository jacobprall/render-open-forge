import { NextResponse } from "next/server";
import { z } from "zod";
import { safeJson } from "@/lib/api-utils";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError } from "@/lib/api/errors";

const patchSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    apiKey: z.string().min(8).optional(),
  })
  .refine((d) => d.label !== undefined || d.apiKey !== undefined, {
    message: "Provide label and/or apiKey",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  const parsedBody = await safeJson(req);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await getPlatform().settings.updateApiKey(auth, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handlePlatformError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  try {
    await getPlatform().settings.deleteApiKey(auth, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handlePlatformError(err);
  }
}
