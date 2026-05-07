import type { ForgejoClient } from "./client";

/** Normalize Forgejo / Gitea `/branch_protections` list responses (bare array vs `{ data: [] }`). */
export function normalizeBranchProtectionList(raw: unknown): Record<string, unknown>[] {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) rows = raw;
  else if (raw && typeof raw === "object") {
    const wrap = raw as Record<string, unknown>;
    if (Array.isArray(wrap.data)) rows = wrap.data;
    else if (Array.isArray(wrap.body)) rows = wrap.body;
  }
  return rows.filter((r): r is Record<string, unknown> => r !== null && typeof r === "object") as Record<
    string,
    unknown
  >[];
}

/** Find a branch protection rule by Forgejo `rule_name` / `branch_name` (varies by version). */
export async function getBranchProtection(
  client: ForgejoClient,
  owner: string,
  repo: string,
  branchName: string,
): Promise<Record<string, unknown> | null> {
  const raw = await client.listBranchProtections(owner, repo);
  const rows = normalizeBranchProtectionList(raw);
  const found = rows.find((r) => {
    if (!r || typeof r !== "object") return false;
    const o = r as Record<string, unknown>;
    return o.rule_name === branchName || o.branch_name === branchName;
  });
  return found ?? null;
}

export async function setBranchProtection(
  client: ForgejoClient,
  owner: string,
  repo: string,
  rule: Record<string, unknown>,
): Promise<unknown> {
  return client.createBranchProtection(owner, repo, rule);
}
