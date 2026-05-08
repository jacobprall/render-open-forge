import { and, eq } from "drizzle-orm";
import { llmApiKeys } from "@render-open-forge/db/schema";
import {
  InsufficientPermissionsError,
  SessionNotFoundError,
  ValidationError,
} from "@render-open-forge/shared";
import type { PlatformDb } from "../interfaces/database";
import type { AuthContext } from "../interfaces/auth";
import { encryptLlmApiKey, isLlmKeyEncryptionConfigured } from "../auth/encryption";
import { llmKeyHint, validateAnthropicApiKey, validateOpenAiApiKey } from "../auth/llm-key-validation";

// ---------------------------------------------------------------------------
// Parameter and result types
// ---------------------------------------------------------------------------

export interface ApiKeyMetadata {
  id: string;
  provider: string;
  scope: string;
  label: string | null;
  keyHint: string | null;
  isValid: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListApiKeysResult {
  encryptionConfigured: boolean;
  isAdmin: boolean;
  envFallback: { anthropic: boolean; openai: boolean };
  keys: ApiKeyMetadata[];
}

export interface CreateOrUpdateApiKeyParams {
  provider: "anthropic" | "openai";
  scope: "platform" | "user";
  label?: string;
  apiKey: string;
}

export interface CreateOrUpdateApiKeyResult {
  id: string;
  provider: string;
  scope: string;
  label: string;
  keyHint: string;
  isValid: boolean;
  updated?: boolean;
  createdAt?: string;
}

export interface UpdateApiKeyParams {
  label?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// SettingsService
// ---------------------------------------------------------------------------

export class SettingsService {
  constructor(private db: PlatformDb) {}

  // -------------------------------------------------------------------------
  // listApiKeys — GET /api/settings/api-keys
  // -------------------------------------------------------------------------

  async listApiKeys(auth: AuthContext): Promise<ListApiKeysResult> {
    const [platform, userScoped] = await Promise.all([
      this.db.select().from(llmApiKeys).where(eq(llmApiKeys.scope, "platform")),
      this.db
        .select()
        .from(llmApiKeys)
        .where(and(eq(llmApiKeys.scope, "user"), eq(llmApiKeys.userId, auth.userId))),
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

    return {
      encryptionConfigured: isLlmKeyEncryptionConfigured(),
      isAdmin: auth.isAdmin,
      envFallback: {
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
      },
      keys,
    };
  }

  // -------------------------------------------------------------------------
  // createOrUpdateApiKey — POST /api/settings/api-keys
  // -------------------------------------------------------------------------

  async createOrUpdateApiKey(
    auth: AuthContext,
    params: CreateOrUpdateApiKeyParams,
  ): Promise<CreateOrUpdateApiKeyResult> {
    if (!isLlmKeyEncryptionConfigured()) {
      throw new ValidationError(
        "Server encryption is not configured. Set ENCRYPTION_KEY (e.g. openssl rand -hex 32) on the web and agent services.",
      );
    }

    const { provider, scope, label, apiKey } = params;

    if (scope === "platform" && !auth.isAdmin) {
      throw new InsufficientPermissionsError("Only administrators can manage platform API keys");
    }

    const trimmedKey = apiKey.trim();
    const valid =
      provider === "anthropic"
        ? await validateAnthropicApiKey(trimmedKey)
        : await validateOpenAiApiKey(trimmedKey);
    if (!valid) {
      throw new ValidationError("API key validation failed — check the key with the provider");
    }

    const hint = llmKeyHint(trimmedKey);
    const enc = encryptLlmApiKey(trimmedKey);
    const now = new Date();
    const resolvedLabel = label?.trim() || (provider === "anthropic" ? "Anthropic" : "OpenAI");

    const whereClause =
      scope === "platform"
        ? and(eq(llmApiKeys.scope, "platform"), eq(llmApiKeys.provider, provider))
        : and(
            eq(llmApiKeys.scope, "user"),
            eq(llmApiKeys.provider, provider),
            eq(llmApiKeys.userId, auth.userId),
          );

    const [existing] = await this.db.select().from(llmApiKeys).where(whereClause).limit(1);

    if (existing) {
      await this.db
        .update(llmApiKeys)
        .set({
          encryptedKey: enc,
          keyHint: hint,
          label: resolvedLabel,
          isValid: true,
          updatedAt: now,
        })
        .where(eq(llmApiKeys.id, existing.id));

      return {
        id: existing.id,
        provider,
        scope,
        label: resolvedLabel,
        keyHint: hint,
        isValid: true,
        updated: true,
      };
    }

    const id = crypto.randomUUID();
    await this.db.insert(llmApiKeys).values({
      id,
      provider,
      scope,
      userId: scope === "user" ? auth.userId : null,
      label: resolvedLabel,
      encryptedKey: enc,
      keyHint: hint,
      isValid: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      provider,
      scope,
      label: resolvedLabel,
      keyHint: hint,
      isValid: true,
      createdAt: now.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // updateApiKey — PATCH /api/settings/api-keys/[id]
  // -------------------------------------------------------------------------

  async updateApiKey(auth: AuthContext, id: string, params: UpdateApiKeyParams): Promise<void> {
    if (!isLlmKeyEncryptionConfigured()) {
      throw new ValidationError("ENCRYPTION_KEY not configured");
    }

    if (params.label === undefined && params.apiKey === undefined) {
      throw new ValidationError("Provide label and/or apiKey");
    }

    const row = await this.authorizeKey(auth, id);

    const updates: {
      label?: string;
      encryptedKey?: string;
      keyHint?: string;
      isValid?: boolean;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (params.label !== undefined) {
      updates.label = params.label.trim();
    }

    if (params.apiKey) {
      const trimmed = params.apiKey.trim();
      const valid =
        row.provider === "anthropic"
          ? await validateAnthropicApiKey(trimmed)
          : await validateOpenAiApiKey(trimmed);
      if (!valid) {
        throw new ValidationError("API key validation failed");
      }
      updates.encryptedKey = encryptLlmApiKey(trimmed);
      updates.keyHint = llmKeyHint(trimmed);
      updates.isValid = true;
    }

    await this.db.update(llmApiKeys).set(updates).where(eq(llmApiKeys.id, id));
  }

  // -------------------------------------------------------------------------
  // deleteApiKey — DELETE /api/settings/api-keys/[id]
  // -------------------------------------------------------------------------

  async deleteApiKey(auth: AuthContext, id: string): Promise<void> {
    await this.authorizeKey(auth, id);
    await this.db.delete(llmApiKeys).where(eq(llmApiKeys.id, id));
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async authorizeKey(
    auth: AuthContext,
    id: string,
  ): Promise<typeof llmApiKeys.$inferSelect> {
    const [row] = await this.db.select().from(llmApiKeys).where(eq(llmApiKeys.id, id)).limit(1);
    if (!row) {
      throw new SessionNotFoundError("API key not found");
    }
    if (row.scope === "platform" && !auth.isAdmin) {
      throw new InsufficientPermissionsError("Only administrators can manage platform API keys");
    }
    if (row.scope === "user" && row.userId !== auth.userId) {
      throw new InsufficientPermissionsError("Access denied");
    }
    return row;
  }
}
