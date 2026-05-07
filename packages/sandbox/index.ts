/**
 * Sandbox package — provides isolated execution environments for the agent.
 * Carried over from render-open-agents with minimal changes.
 *
 * TODO: Copy full sandbox implementation from render-open-agents
 */

export interface SandboxProvider {
  id: string;
  provision(opts: ProvisionOptions): Promise<string>;
  destroy(sessionId: string): Promise<void>;
  health(): Promise<SandboxHealth>;
}

export interface ProvisionOptions {
  sessionId: string;
  cloneUrl?: string;
  branch?: string;
}

export interface SandboxHealth {
  available: boolean;
  activeSessions: number;
}

const providers = new Map<string, SandboxProvider>();

export function registerSandboxProvider(provider: SandboxProvider): void {
  providers.set(provider.id, provider);
}

export function getSandboxProvider(id: string): SandboxProvider {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Sandbox provider not registered: ${id}`);
  return provider;
}
