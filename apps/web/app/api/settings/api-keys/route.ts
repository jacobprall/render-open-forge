import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { llmApiKeys } from "@render-open-forge/db/schema";
import {
  encryptLlmApiKey,
  isLlmKeyEncryptionConfigured,
  llmKeyHint,
  validateAnthropicApiKey,
  validateOpenAiApiKey,
} from "@render-open-forge/platform";

const postSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  scope: z.enum(["platform", "user"]),
  label: z.string().min(1).max(120).optional(),
  apiKey: z.string().min(8),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const [platform, userScoped] = await Promise.all([
    db.select().from(llmApiKeys).where(eq(llmApiKeys.scope, "platform")),
    db
      .select()
      .from(llmApiKeys)
      .where(and(eq(llmApiKeys.scope, "user"), eq(llmApiKeys.userId, session.userId))),
  ]);

  const keys = [...platform, ...userScoped].map((r) => ({
    id: r.id,
    provider: r.provider,
    scope: r.scope,
    label: r.label,
    keyHint: r.keyHint,
    isValid: r.isValid,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return NextResponse.json({
    encryptionConfigured: isLlmKeyEncryptionConfigured(),
    isAdmin: session.isAdmin,
    envFallback: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    keys,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isLlmKeyEncryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          "Server encryption is not configured. Set ENCRYPTION_KEY (e.g. openssl rand -hex 32) on the web and agent services.",
      },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { provider, scope, label, apiKey } = parsed.data;
  if (scope === "platform" && !session.isAdmin) {
    return NextResponse.json(
      { error: "Only administrators can manage platform API keys" },
      { status: 403 },
    );
  }

  const trimmedKey = apiKey.trim();
  const valid =
    provider === "anthropic"
      ? await validateAnthropicApiKey(trimmedKey)
      : await validateOpenAiApiKey(trimmedKey);
  if (!valid) {
    return NextResponse.json(
      { error: "API key validation failed — check the key with the provider" },
      { status: 400 },
    );
  }

  const db = getDb();
  const hint = llmKeyHint(trimmedKey);
  const enc = encryptLlmApiKey(trimmedKey);
  const now = new Date();
  const resolvedLabel =
    label?.trim() || (provider === "anthropic" ? "Anthropic" : "OpenAI");

  const whereClause =
    scope === "platform"
      ? and(eq(llmApiKeys.scope, "platform"), eq(llmApiKeys.provider, provider))
      : and(
          eq(llmApiKeys.scope, "user"),
          eq(llmApiKeys.provider, provider),
          eq(llmApiKeys.userId, session.userId),
        );

  const [existing] = await db.select().from(llmApiKeys).where(whereClause).limit(1);

  if (existing) {
    await db
      .update(llmApiKeys)
      .set({
        encryptedKey: enc,
        keyHint: hint,
        label: resolvedLabel,
        isValid: true,
        updatedAt: now,
      })
      .where(eq(llmApiKeys.id, existing.id));

    return NextResponse.json({
      id: existing.id,
      provider,
      scope,
      label: resolvedLabel,
      keyHint: hint,
      isValid: true,
      updated: true,
    });
  }

  const id = crypto.randomUUID();
  await db.insert(llmApiKeys).values({
    id,
    provider,
    scope,
    userId: scope === "user" ? session.userId : null,
    label: resolvedLabel,
    encryptedKey: enc,
    keyHint: hint,
    isValid: true,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    id,
    provider,
    scope,
    label: resolvedLabel,
    keyHint: hint,
    isValid: true,
    createdAt: now.toISOString(),
  });
}
