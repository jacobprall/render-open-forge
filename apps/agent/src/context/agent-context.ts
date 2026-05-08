/**
 * Context passed to agent tools via AI SDK's experimental_context.
 *
 * Uses the forge-agnostic ForgeProvider interface so the agent is
 * decoupled from any specific forge implementation.
 */

import type { ForgeProvider } from "@openforge/platform/forge";
import type { SandboxAdapter } from "@openforge/sandbox";

export type { SandboxAdapter };

export interface ForgeAgentContext {
  __brand: "ForgeAgentContext";
  sessionId: string;
  forge: ForgeProvider;
  repoOwner: string;
  repoName: string;
  branch: string;
  baseBranch: string;
  adapter: SandboxAdapter;
  onFileChanged?: (event: FileChangedEvent) => void | Promise<void>;
  /** Called after a PR is successfully created (e.g. to persist session state). */
  onPrCreated?: (event: { prNumber: number; prStatus: string }) => void | Promise<void>;
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

function getAdapter(ctx: unknown): SandboxAdapter {
  if (isForgeAgentContext(ctx)) return ctx.adapter;
  throw new Error("Agent context not available — cannot access sandbox adapter");
}

function getSessionId(ctx: unknown): string {
  if (isForgeAgentContext(ctx)) return ctx.sessionId;
  throw new Error("Agent context not available — cannot determine session ID");
}

export function getSandboxContext(ctx: unknown): { adapter: SandboxAdapter; sessionId: string } {
  return { adapter: getAdapter(ctx), sessionId: getSessionId(ctx) };
}
