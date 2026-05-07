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
    id: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    nativeId: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    description: "Best balance of speed and intelligence",
  },
  {
    id: "anthropic/claude-haiku-4-5",
    provider: "anthropic",
    nativeId: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Fast and cost-effective",
  },
  {
    id: "anthropic/claude-opus-4-7",
    provider: "anthropic",
    nativeId: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Most powerful — slower and expensive",
    supportsThinking: true,
  },
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

export const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4-5";

export type ModelSummary = Pick<
  ModelDef,
  "id" | "provider" | "label" | "description" | "supportsThinking"
>;

export function toModelSummaries(defs: ModelDef[]): ModelSummary[] {
  return defs.map(({ id, provider, label, description, supportsThinking }) => ({
    id,
    provider,
    label,
    description,
    supportsThinking,
  }));
}

export function filterModelsByCredentialAvailability(
  defs: ModelDef[],
  env: { anthropic: boolean; openai: boolean },
): ModelDef[] {
  return defs.filter((m) =>
    m.provider === "anthropic" ? env.anthropic : env.openai,
  );
}
