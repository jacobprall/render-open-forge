import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ValidationError,
  SessionNotFoundError,
  InsufficientPermissionsError,
} from "@render-open-forge/shared";
import { getPlatform, requireAuth } from "@/lib/platform";

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

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
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
    if (err instanceof ValidationError) {
      const status = err.message.includes("ENCRYPTION_KEY") ? 503 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof InsufficientPermissionsError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
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
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof InsufficientPermissionsError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }
}
