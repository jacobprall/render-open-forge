/**
 * Static catalog of OpenAI models. Anthropic models are fetched dynamically
 * from their `/v1/models` API by the gateway's ModelService.
 */
export interface ModelDef {
  id: string;
  provider: "anthropic" | "openai";
  nativeId: string;
  label: string;
  description: string;
  supportsThinking?: boolean;
}

export const MODEL_DEFS: ModelDef[] = [
  {
    id: "openai/gpt-4.1",
    provider: "openai",
    nativeId: "gpt-4.1",
    label: "GPT-4.1",
    description: "Strong baseline, fast",
  },
  {
    id: "openai/gpt-4.1-mini",
    provider: "openai",
    nativeId: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    description: "Fast and cheap",
  },
  {
    id: "openai/o3",
    provider: "openai",
    nativeId: "o3",
    label: "o3",
    description: "Extended reasoning — slow",
    supportsThinking: true,
  },
  {
    id: "openai/o4-mini",
    provider: "openai",
    nativeId: "o4-mini",
    label: "o4-mini",
    description: "Reasoning — faster than o3",
    supportsThinking: true,
  },
];

export type ModelSummary = Pick<
  ModelDef,
  "id" | "provider" | "label" | "description" | "supportsThinking"
>;
