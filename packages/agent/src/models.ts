import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface ModelDef {
  id: string;
  provider: "anthropic" | "openai";
  modelId: string;
  displayName: string;
  supportsThinking?: boolean;
}

const MODEL_PREFERENCE = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-5",
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-haiku-4-5",
];

const ADAPTIVE_THINKING_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-opus-4-1",
  "claude-opus-4",
  "claude-sonnet-4",
]);

let _availableModels: ModelDef[] | null = null;
let _defaultModelId: string | null = null;

function supportsAdaptiveThinking(modelId: string): boolean {
  const base = modelId.replace(/-\d{8}$/, "");
  return ADAPTIVE_THINKING_MODELS.has(base);
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

export async function fetchAvailableModels(): Promise<ModelDef[]> {
  const models: ModelDef[] = [];

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
        const body = (await res.json()) as { data?: Array<{ id: string }> };
        for (const m of body.data ?? []) {
          models.push({
            id: toCanonicalId("anthropic", m.id),
            provider: "anthropic",
            modelId: m.id,
            displayName: toDisplayName(m.id),
            supportsThinking: supportsAdaptiveThinking(m.id),
          });
        }
      }
    } catch {
      console.warn("[models] Failed to fetch Anthropic models, using fallback");
    }
  }

  if (models.length === 0) {
    models.push({
      id: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      displayName: "Claude Sonnet 4",
      supportsThinking: true,
    });
  }

  models.sort((a, b) => {
    const ai = MODEL_PREFERENCE.findIndex((p) => a.modelId.startsWith(p));
    const bi = MODEL_PREFERENCE.findIndex((p) => b.modelId.startsWith(p));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const seen = new Set<string>();
  const deduped = models.filter((m) => {
    const key = toCanonicalId(m.provider, m.modelId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  _availableModels = deduped;
  _defaultModelId = deduped[0]?.id ?? null;

  console.log(
    `[models] ${deduped.length} models available, default: ${_defaultModelId}`,
  );

  return deduped;
}

export function getAvailableModels(): ModelDef[] {
  if (!_availableModels) {
    throw new Error("Models not initialized — call fetchAvailableModels() at startup");
  }
  return _availableModels;
}

export function getDefaultModelId(): string {
  return _defaultModelId ?? "anthropic/claude-sonnet-4";
}

export function getModelDef(modelId?: string): ModelDef {
  const models = getAvailableModels();
  const id = modelId || getDefaultModelId();
  return models.find((m) => m.id === id) ?? models[0]!;
}

export function getModel(modelId?: string): LanguageModel {
  const def = getModelDef(modelId);
  switch (def.provider) {
    case "anthropic":
      return anthropic(def.modelId);
    case "openai":
      return openai(def.modelId);
    default:
      return anthropic(def.modelId);
  }
}
