import { NextResponse } from "next/server";

interface AnthropicModel {
  id: string;
}

interface ModelSummary {
  id: string;
  provider: string;
  label: string;
  nativeId: string;
}

function toDisplayName(modelId: string): string {
  return modelId
    .replace(/^claude-/, "Claude ")
    .replace(/-(\d{8})$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toCanonicalId(provider: string, modelId: string): string {
  return `${provider}/${modelId.replace(/-\d{8}$/, "")}`;
}

let cachedModels: ModelSummary[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchModels(): Promise<ModelSummary[]> {
  if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedModels;
  }

  const models: ModelSummary[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const body = (await res.json()) as { data?: AnthropicModel[] };
        const seen = new Set<string>();
        for (const m of body.data ?? []) {
          const canonId = toCanonicalId("anthropic", m.id);
          if (seen.has(canonId)) continue;
          seen.add(canonId);
          models.push({
            id: canonId,
            provider: "anthropic",
            label: toDisplayName(m.id),
            nativeId: m.id,
          });
        }
      }
    } catch {
      // fall through to empty
    }
  }

  cachedModels = models;
  cachedAt = Date.now();
  return models;
}

export async function GET() {
  const models = await fetchModels();
  return NextResponse.json({ models });
}
