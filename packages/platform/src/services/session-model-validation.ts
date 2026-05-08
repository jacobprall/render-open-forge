/**
 * Validate that a model ID is known and the user has credentials for its provider.
 * Returns ok: true if valid, or ok: false with a human-readable error and available list.
 *
 * This mirrors validateModelOrThrow from apps/web/lib/models/anthropic-models.ts but
 * avoids importing a Next.js-coupled module from the platform layer.
 */
export async function validateModel(
  modelId: string,
  keys: { anthropic?: string; openai?: string },
): Promise<{ ok: true } | { ok: false; error: string; available: string[] }> {
  if (modelId.startsWith("openai/")) {
    if (!keys.openai) {
      return {
        ok: false,
        error: "No OpenAI API key configured. Add one in Settings → API Keys or set OPENAI_API_KEY.",
        available: [],
      };
    }
    return { ok: true };
  }

  if (keys.anthropic) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: {
          "x-api-key": keys.anthropic,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ id: string }> };
        const ids = (body.data ?? []).map((m) => {
          const provider = "anthropic";
          const normalized = m.id.replace(/-\d{8}$/, "");
          return `${provider}/${normalized}`;
        });
        if (ids.length > 0 && !ids.includes(modelId)) {
          return { ok: false, error: `Unknown model: ${modelId}`, available: ids };
        }
      }
    } catch {
      // Catalog fetch failed — allow the requested model through
    }
  }

  return { ok: true };
}
