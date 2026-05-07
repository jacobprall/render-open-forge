/**
 * Repo lifecycle wrappers around ForgejoClient for shared reuse (UI + tools).
 */
import type { ForgejoClient, CreateRepoParams } from "./client";
import {
  getBranchProtection,
  normalizeBranchProtectionList,
  setBranchProtection,
} from "./branch-protection";

export async function forgeCreateUserRepo(client: ForgejoClient, params: CreateRepoParams) {
  return client.createRepo(params);
}

export async function forgeDeleteRepo(client: ForgejoClient, owner: string, repo: string) {
  return client.deleteRepo(owner, repo);
}

export async function forgeUpdateRepo(
  client: ForgejoClient,
  owner: string,
  repo: string,
  patch: Record<string, unknown>,
) {
  return client.updateRepo(owner, repo, patch);
}

export async function forgeForkRepo(client: ForgejoClient, owner: string, repo: string, name?: string) {
  return client.forkRepo(owner, repo, name);
}

// --- Branch protection (Forgejo / Gitea) ---

export async function forgeListBranchProtections(client: ForgejoClient, owner: string, repo: string) {
  const raw = await client.listBranchProtections(owner, repo);
  return normalizeBranchProtectionList(raw);
}

export async function forgeGetBranchProtection(
  client: ForgejoClient,
  owner: string,
  repo: string,
  branchOrRuleName: string,
) {
  return getBranchProtection(client, owner, repo, branchOrRuleName);
}

export async function forgeSetBranchProtection(
  client: ForgejoClient,
  owner: string,
  repo: string,
  rule: Record<string, unknown>,
) {
  return setBranchProtection(client, owner, repo, rule);
}

export async function forgeDeleteBranchProtection(
  client: ForgejoClient,
  owner: string,
  repo: string,
  ruleName: string,
) {
  return client.deleteBranchProtection(owner, repo, ruleName);
}
