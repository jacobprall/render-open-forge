import { ForgejoClient } from "@render-open-forge/shared/lib/forgejo/client";

export { ForgejoClient } from "@render-open-forge/shared/lib/forgejo/client";
export type {
  ForgejoRepo,
  ForgejoBranch,
  ForgejoPullRequest,
  ForgejoFileContent,
  ForgejoCommit,
} from "@render-open-forge/shared/lib/forgejo/client";

const FORGEJO_URL = process.env.FORGEJO_INTERNAL_URL || "http://localhost:3000";

export function createForgejoClient(token: string): ForgejoClient {
  return new ForgejoClient(FORGEJO_URL, token);
}

export function getAgentClient(): ForgejoClient {
  const token = process.env.FORGEJO_AGENT_TOKEN;
  if (!token) throw new Error("FORGEJO_AGENT_TOKEN not configured");
  return new ForgejoClient(FORGEJO_URL, token);
}
