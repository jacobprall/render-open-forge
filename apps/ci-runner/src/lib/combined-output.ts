/** Max chars retained from concatenated step stdout/stderr for test-result scanning. */
export const MAX_COMBINED_OUTPUT_CHARS = 2_000_000;

const TRUNC_MARKER = "\n…[truncated combined output]…\n";

export function appendCombinedOutput(current: string, stdout: string, stderr: string): string {
  const addition = `${stdout}\n${stderr}\n`;
  const next = current + addition;
  if (next.length <= MAX_COMBINED_OUTPUT_CHARS) return next;
  const budget = MAX_COMBINED_OUTPUT_CHARS - TRUNC_MARKER.length;
  return next.slice(0, Math.max(0, budget)) + TRUNC_MARKER;
}
