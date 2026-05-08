/**
 * ForgeProviderFactory — creates ForgeProvider instances from config.
 *
 * Call `createForgeProvider(config)` to get a fully initialized provider.
 * The factory picks the correct adapter based on the `type` field.
 *
 * For the internal Forgejo instance, use `getDefaultForgeProvider(token)`.
 */

import type { ForgeProvider, ForgeProviderType } from "./provider";
import { ForgejoProvider } from "./forgejo-adapter";

export interface ForgeProviderConfig {
  type: ForgeProviderType;
  baseUrl: string;
  token: string;
  webhookSecret?: string;
}

/**
 * Build a ForgeProvider from explicit config.
 * Throws if the provider type isn't implemented yet.
 */
export function createForgeProvider(config: ForgeProviderConfig): ForgeProvider {
  switch (config.type) {
    case "forgejo":
      return new ForgejoProvider(config.baseUrl, config.token, config.webhookSecret);

    case "github":
      throw new Error(
        "GitHub provider not yet implemented. " +
        "Contribute a GitHubProvider that implements ForgeProvider.",
      );

    case "gitlab":
      throw new Error(
        "GitLab provider not yet implemented. " +
        "Contribute a GitLabProvider that implements ForgeProvider.",
      );

    default:
      throw new Error(`Unknown forge provider type: ${config.type}`);
  }
}

/**
 * Shortcut: build a ForgeProvider for the internal Forgejo instance
 * using FORGEJO_URL from the environment.
 */
export function getDefaultForgeProvider(token: string): ForgeProvider {
  const baseUrl = process.env.FORGEJO_INTERNAL_URL ?? process.env.FORGEJO_URL ?? "http://localhost:3000";
  const webhookSecret = process.env.FORGEJO_WEBHOOK_SECRET;
  return createForgeProvider({ type: "forgejo", baseUrl, token, webhookSecret });
}
