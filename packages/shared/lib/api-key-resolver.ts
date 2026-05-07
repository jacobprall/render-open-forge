import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@render-open-forge/db/schema";
import { decryptLlmApiKey } from "./encryption";

export type ResolvedLlmKeys = {
  anthropic?: string;
  openai?: string;
};

function tryDecryptRow(
  row: typeof schema.llmApiKeys.$inferSelect | undefined,
): string | undefined {
  if (!row?.isValid) return undefined;
  try {
    return decryptLlmApiKey(row.encryptedKey);
  } catch {
    return undefined;
  }
}

/**
 * Resolves LLM credentials for a user: user-scoped DB row overrides platform row; both override env.
 */
export async function resolveLlmApiKeys(
  db: PostgresJsDatabase<typeof schema>,
  userId: string,
): Promise<ResolvedLlmKeys> {
  const [userAnthropic] = await db
    .select()
    .from(schema.llmApiKeys)
    .where(
      and(
        eq(schema.llmApiKeys.scope, "user"),
        eq(schema.llmApiKeys.userId, userId),
        eq(schema.llmApiKeys.provider, "anthropic"),
      ),
    )
    .limit(1);

  const [userOpenai] = await db
    .select()
    .from(schema.llmApiKeys)
    .where(
      and(
        eq(schema.llmApiKeys.scope, "user"),
        eq(schema.llmApiKeys.userId, userId),
        eq(schema.llmApiKeys.provider, "openai"),
      ),
    )
    .limit(1);

  const [platAnthropic] = await db
    .select()
    .from(schema.llmApiKeys)
    .where(and(eq(schema.llmApiKeys.scope, "platform"), eq(schema.llmApiKeys.provider, "anthropic")))
    .limit(1);

  const [platOpenai] = await db
    .select()
    .from(schema.llmApiKeys)
    .where(and(eq(schema.llmApiKeys.scope, "platform"), eq(schema.llmApiKeys.provider, "openai")))
    .limit(1);

  const anthropic =
    tryDecryptRow(userAnthropic) ?? tryDecryptRow(platAnthropic) ?? process.env.ANTHROPIC_API_KEY;

  const openai = tryDecryptRow(userOpenai) ?? tryDecryptRow(platOpenai) ?? process.env.OPENAI_API_KEY;

  const out: ResolvedLlmKeys = {};
  if (anthropic) out.anthropic = anthropic;
  if (openai) out.openai = openai;
  return out;
}
