/**
 * Context passed to agent tools via AI SDK's experimental_context.
 *
 * Unlike render-open-agents (which carried githubToken), this context
 * always has a valid Forgejo service token — no OAuth dance required.
 */

import type { ForgejoClient } from "@render-open-forge/shared/lib/forgejo/client";
import type { SandboxAdapter } from "@render-open-forge/sandbox";

export type { SandboxAdapter };

export interface ForgeAgentContext {
  __brand: "ForgeAgentContext";
  sessionId: string;
  forgejoClient: ForgejoClient;
  repoOwner: string;
  repoName: string;
  branch: string;
  baseBranch: string;
  adapter: SandboxAdapter;
  onFileChanged?: (event: FileChangedEvent) => void | Promise<void>;
}

export interface FileChangedEvent {
  path: string;
  additions: number;
  deletions: number;
  unifiedDiffPreview?: string;
}

export function isForgeAgentContext(ctx: unknown): ctx is ForgeAgentContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "__brand" in ctx &&
    (ctx as ForgeAgentContext).__brand === "ForgeAgentContext"
  );
}

export function getAdapter(ctx: unknown): SandboxAdapter {
  if (isForgeAgentContext(ctx)) return ctx.adapter;
  throw new Error("Agent context not available — cannot access sandbox adapter");
}

export function getSessionId(ctx: unknown): string {
  if (isForgeAgentContext(ctx)) return ctx.sessionId;
  throw new Error("Agent context not available — cannot determine session ID");
}
