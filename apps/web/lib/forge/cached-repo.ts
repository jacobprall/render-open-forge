import { cache } from "react";
import { createForgeProvider } from "./client";
import type { ForgeProviderType } from "@openforge/platform/forge";
import type { ForgeRepo } from "@openforge/platform/forge/types";

/** Dedupes `repos.get` for the same token + owner + repo within one RSC request (layout + page). */
export const getForgeRepoCached = cache(
  async (forgeToken: string, owner: string, repo: string, forgeType?: ForgeProviderType): Promise<ForgeRepo> => {
    const forge = createForgeProvider(forgeToken, forgeType);
    return forge.repos.get(owner, repo);
  },
);
