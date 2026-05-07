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

let cachedModels: ModelSummary[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Fetches Anthropic models with in-process TTL cache. Shared by /api/models and route handlers. */
export async function fetchAnthropicModels(): Promise<ModelSummary[]> {
  if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedModels;
  }

  const models: ModelSummary[] = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
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
    console.warn("[models] ANTHROPIC_API_KEY not set");
  }

  if (models.length > 0) {
    cachedModels = models;
    cachedAt = Date.now();
  }
  return models;
}

/** Returns whether modelId is known, or true if the catalog is empty / unavailable (caller may proceed). */
export async function isKnownModelId(modelId: string): Promise<boolean> {
  const models = await fetchAnthropicModels();
  if (models.length === 0) return true;
  return models.some((m) => m.id === modelId);
}

export async function validateModelOrThrow(modelId: string): Promise<
  | { ok: true }
  | { ok: false; error: string; available: string[] }
> {
  const models = await fetchAnthropicModels();
  if (models.length === 0) return { ok: true };
  if (models.some((m) => m.id === modelId)) return { ok: true };
  return {
    ok: false,
    error: `Unknown model: ${modelId}`,
    available: models.map((m) => m.id),
  };
}
