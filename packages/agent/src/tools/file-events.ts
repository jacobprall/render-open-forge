import { isForgeAgentContext } from "../context/agent-context";

export async function notifyFileChanged(
  experimental_context: unknown,
  path: string,
  before: string,
  after: string,
): Promise<void> {
  if (!isForgeAgentContext(experimental_context)) return;
  const cb = experimental_context.onFileChanged;
  if (!cb) return;

  const additions = after.split("\n").length - before.split("\n").length;
  const deletions = additions < 0 ? Math.abs(additions) : 0;
  await cb({ path, additions: Math.max(0, additions), deletions });
}
