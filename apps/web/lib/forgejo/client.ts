import { getDefaultForgeProvider, type ForgeProvider } from "@render-open-forge/platform/forge";
import { ForgejoProvider } from "@render-open-forge/platform/forge/forgejo-adapter";

export type { ForgeProvider } from "@render-open-forge/platform/forge";

const FORGEJO_URL = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";

export function createForgeProvider(token: string): ForgeProvider {
  return new ForgejoProvider(FORGEJO_URL, token);
}

export function getAgentForgeProvider(): ForgeProvider {
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return getDefaultForgeProvider(token);
}
