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

export const MODEL_DEFS: ModelDef[] = [
  {
    id: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    modelId: "claude-sonnet-4-5-20250514",
    displayName: "Claude Sonnet 4.5",
    supportsThinking: true,
  },
  {
    id: "anthropic/claude-opus-4",
    provider: "anthropic",
    modelId: "claude-opus-4-20250514",
    displayName: "Claude Opus 4",
    supportsThinking: true,
  },
  {
    id: "openai/gpt-4o",
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
  },
];

export const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4-5";

export function getModelDef(modelId?: string): ModelDef {
  const id = modelId || DEFAULT_MODEL_ID;
  const def = MODEL_DEFS.find((m) => m.id === id);
  if (!def) return MODEL_DEFS[0]!;
  return def;
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
