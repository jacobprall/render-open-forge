import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSession, type UserSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { llmApiKeys } from "@render-open-forge/db/schema";
import {
  encryptLlmApiKey,
  isLlmKeyEncryptionConfigured,
  llmKeyHint,
  validateAnthropicApiKey,
  validateOpenAiApiKey,
} from "@render-open-forge/platform";

const patchSchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    apiKey: z.string().min(8).optional(),
  })
  .refine((d) => d.label !== undefined || d.apiKey !== undefined, {
    message: "Provide label and/or apiKey",
  });

async function authorizeRow(
  session: UserSession,
  id: string,
): Promise<
  { ok: true; row: typeof llmApiKeys.$inferSelect } | { ok: false; status: 404 | 403 }
> {
  const db = getDb();
  const [row] = await db.select().from(llmApiKeys).where(eq(llmApiKeys.id, id)).limit(1);
  if (!row) return { ok: false, status: 404 };
  if (row.scope === "platform" && !session.isAdmin) return { ok: false, status: 403 };
  if (row.scope === "user" && row.userId !== session.userId) {
    return { ok: false, status: 403 };
  }
  return { ok: true, row };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isLlmKeyEncryptionConfigured()) {
    return NextResponse.json({ error: "ENCRYPTION_KEY not configured" }, { status: 503 });
  }

  const { id } = await params;
  const auth = await authorizeRow(session, id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 404 ? "Not found" : "Forbidden" }, {
      status: auth.status,
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: {
    label?: string;
    encryptedKey?: string;
    keyHint?: string;
    isValid?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.data.label !== undefined) {
    updates.label = parsed.data.label.trim();
  }

  if (parsed.data.apiKey) {
    const trimmed = parsed.data.apiKey.trim();
    const valid =
      auth.row.provider === "anthropic"
        ? await validateAnthropicApiKey(trimmed)
        : await validateOpenAiApiKey(trimmed);
    if (!valid) {
      return NextResponse.json({ error: "API key validation failed" }, { status: 400 });
    }
    updates.encryptedKey = encryptLlmApiKey(trimmed);
    updates.keyHint = llmKeyHint(trimmed);
    updates.isValid = true;
  }

  await getDb().update(llmApiKeys).set(updates).where(eq(llmApiKeys.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const auth = await authorizeRow(session, id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 404 ? "Not found" : "Forbidden" }, {
      status: auth.status,
    });
  }

  await getDb().delete(llmApiKeys).where(eq(llmApiKeys.id, id));
  return NextResponse.json({ ok: true });
}
