import { z } from "zod";

export const AgentConfigSchema = z.object({
  pipeline: z.array(z.object({
    role: z.enum(["spec", "implement", "review", "merge"]),
    model: z.string().optional(),
    trigger: z.string(),
    tools: z.array(z.string()).optional(),
    auto: z.boolean().optional(),
    systemPrompt: z.string().optional(),
  })).optional(),
  verifyChecks: z.array(z.object({
    name: z.string(),
    command: z.string(),
    timeout: z.number().optional(),
  })).optional(),
  autoMerge: z.boolean().optional(),
  maxCiFixAttempts: z.number().optional(),
  defaultModel: z.string().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export async function loadAgentConfig(repoContent: string | null): Promise<AgentConfig | null> {
  if (!repoContent) return null;
  try {
    const parsed = JSON.parse(repoContent);
    return AgentConfigSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function mergeWithDefaults(config: AgentConfig | null): AgentConfig {
  return {
    autoMerge: config?.autoMerge ?? false,
    maxCiFixAttempts: config?.maxCiFixAttempts ?? 3,
    defaultModel: config?.defaultModel ?? "anthropic/claude-sonnet-4-5",
    verifyChecks: config?.verifyChecks ?? [],
    pipeline: config?.pipeline,
  };
}
