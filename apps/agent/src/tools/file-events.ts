import { isForgeAgentContext } from "../context/agent-context";

function countDiff(before: string, after: string): { additions: number; deletions: number } {
  const oldLines = before ? before.split("\n") : [];
  const newLines = after ? after.split("\n") : [];
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let additions = 0;
  let deletions = 0;
  for (const line of newLines) {
    if (!oldSet.has(line)) additions++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) deletions++;
  }
  return { additions, deletions };
}

export async function notifyFileChanged(
  experimental_context: unknown,
  path: string,
  before: string,
  after: string,
): Promise<void> {
  if (!isForgeAgentContext(experimental_context)) return;
  const cb = experimental_context.onFileChanged;
  if (!cb) return;

  const { additions, deletions } = countDiff(before, after);
  await cb({ path, additions, deletions });
}
