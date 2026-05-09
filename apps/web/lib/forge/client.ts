import {
  getDefaultForgeProvider,
  createForgeProvider as createForgeProviderFromConfig,
  type ForgeProvider,
  type ForgeProviderType,
} from "@openforge/platform/forge";

export type { ForgeProvider } from "@openforge/platform/forge";

/**
 * Get a ForgeProvider authenticated with the server-side agent token.
 * Falls back to Forgejo if configured, otherwise throws.
 */
export function getAgentForgeProvider(): ForgeProvider {
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return getDefaultForgeProvider(token);
}

/**
 * Create a ForgeProvider from a token and forge type.
 * Defaults to GitHub. Pass forgeType to use a different provider.
 */
export function createForgeProvider(
  token: string,
  forgeType: ForgeProviderType = "github",
): ForgeProvider {
  if (forgeType === "github") {
    return createForgeProviderFromConfig({
      type: "github",
      baseUrl: "https://api.github.com",
      token,
    });
  }
  if (forgeType === "gitlab") {
    return createForgeProviderFromConfig({
      type: "gitlab",
      baseUrl: "https://gitlab.com",
      token,
    });
  }
  const forgejoUrl = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";
  return createForgeProviderFromConfig({
    type: "forgejo",
    baseUrl: forgejoUrl,
    token,
    webhookSecret: process.env.FORGEJO_WEBHOOK_SECRET,
  });
}
