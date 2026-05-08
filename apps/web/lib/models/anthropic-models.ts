import { MODEL_DEFS } from "@openforge/shared";
import type { ResolvedLlmKeys } from "@openforge/platform";

export interface AnthropicModelInfo {
  id: string;
  display_name?: string;
  capabilities?: {
    thinking?: {
      supported?: boolean;
      types?: {
        adaptive?: { supported?: boolean };
        enabled?: { supported?: boolean };
      };
    };
  };
}

export interface ModelSummary {
  id: string;
  provider: string;
  label: string;
  nativeId: string;
  supportsThinking?: boolean;
}

function toCanonicalId(provider: string, modelId: string): string {
  return `${provider}/${modelId.replace(/-\d{8}$/, "")}`;
}

const anthropicCache = new Map<string, { at: number; models: ModelSummary[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function anthropicCacheKey(apiKey: string | undefined): string {
  if (!apiKey) return "none";
  return `${apiKey.length}:${apiKey.slice(0, 12)}`;
}

/** Fetches Anthropic models with optional key (user/platform resolved or env). */
export async function fetchAnthropicModelsWithApiKey(
  apiKey: string | undefined,
): Promise<ModelSummary[]> {
  const ck = anthropicCacheKey(apiKey);
  const hit = anthropicCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.models;
  }

  const models: ModelSummary[] = [];
  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const body = (await res.json()) as { data?: AnthropicModelInfo[] };
        const seen = new Set<string>();
        for (const m of body.data ?? []) {
          const canonId = toCanonicalId("anthropic", m.id);
          if (seen.has(canonId)) continue;
          seen.add(canonId);

          const thinking = m.capabilities?.thinking;
          const supportsAdaptive = thinking?.types?.adaptive?.supported === true;
          const supportsEnabled = thinking?.types?.enabled?.supported === true;

          models.push({
            id: canonId,
            provider: "anthropic",
            label: m.display_name ?? m.id,
            nativeId: m.id,
            supportsThinking: supportsAdaptive || supportsEnabled,
          });
        }
      } else {
        console.warn(`[models] Anthropic API returned ${res.status}`);
      }
    } catch (err) {
      console.warn("[models] Failed to fetch from Anthropic:", err instanceof Error ? err.message : err);
    }
  } else {
    console.warn("[models] No Anthropic API key available for model list");
  }

  if (models.length > 0) {
    anthropicCache.set(ck, { at: Date.now(), models });
  }
  return models;
}

function openAiSummariesFromCatalog(): ModelSummary[] {
  return MODEL_DEFS.filter((m) => m.provider === "openai").map((m) => ({
    id: m.id,
    provider: "openai",
    label: m.label,
    nativeId: m.nativeId,
    supportsThinking: m.supportsThinking,
  }));
}

/** Models available to the current user given resolved credentials (DB + env fallback). */
export async function fetchModelsForSession(keys: ResolvedLlmKeys): Promise<ModelSummary[]> {
  const anthropic = await fetchAnthropicModelsWithApiKey(keys.anthropic);
  const openai = keys.openai ? openAiSummariesFromCatalog() : [];
  const merged = [...anthropic, ...openai];
  const seen = new Set<string>();
  return merged.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

/** Returns whether modelId is known, or true if the catalog is empty / unavailable (caller may proceed). */
export async function isKnownModelId(
  modelId: string,
  keys: ResolvedLlmKeys,
): Promise<boolean> {
  const r = await validateModelOrThrow(modelId, keys);
  return r.ok;
}

export async function validateModelOrThrow(
  modelId: string,
  keys: ResolvedLlmKeys,
): Promise<
  | { ok: true }
  | { ok: false; error: string; available: string[] }
> {
  if (modelId.startsWith("openai/")) {
    if (!keys.openai) {
      return {
        ok: false,
        error: "No OpenAI API key configured. Add one in Settings → API Keys or set OPENAI_API_KEY.",
        available: MODEL_DEFS.filter((m) => m.provider === "openai").map((m) => m.id),
      };
    }
    const allowed = MODEL_DEFS.filter((m) => m.provider === "openai");
    if (allowed.some((m) => m.id === modelId)) return { ok: true };
    return {
      ok: false,
      error: `Unknown model: ${modelId}`,
      available: allowed.map((m) => m.id),
    };
  }

  const models = await fetchAnthropicModelsWithApiKey(keys.anthropic);
  if (models.length === 0) return { ok: true };
  if (models.some((m) => m.id === modelId)) return { ok: true };
  return {
    ok: false,
    error: `Unknown model: ${modelId}`,
    available: models.map((m) => m.id),
  };
}
