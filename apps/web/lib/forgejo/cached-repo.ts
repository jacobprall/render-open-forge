import { cache } from "react";
import { createForgeProvider } from "./client";
import type { ForgeRepo } from "@render-open-forge/platform/forge/types";

/** Dedupes `repos.get` for the same token + owner + repo within one RSC request (layout + page). */
export const getForgeRepoCached = cache(
  async (forgejoToken: string, owner: string, repo: string): Promise<ForgeRepo> => {
    const forge = createForgeProvider(forgejoToken);
    return forge.repos.get(owner, repo);
  },
);
