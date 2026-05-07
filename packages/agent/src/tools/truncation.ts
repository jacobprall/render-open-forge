import { isForgeAgentContext } from "../context/agent-context";

export const MAX_BASH_STREAM_CHARS = 16_000;
export const MAX_READ_FILE_CHARS = 80_000;
export const MAX_GREP_MATCHES = 150;
export const MAX_GREP_MATCH_LINE_CHARS = 400;

export interface TruncatedString {
  value: string;
  truncated: boolean;
  originalLength: number;
}

export function truncateLargeString(input: string, max: number): TruncatedString {
  if (input.length <= max) {
    return { value: input, truncated: false, originalLength: input.length };
  }
  const headLen = Math.floor(max * 0.7);
  const tailLen = Math.max(0, max - headLen - 80);
  const head = input.slice(0, headLen);
  const tail = tailLen > 0 ? input.slice(-tailLen) : "";
  const omitted = input.length - head.length - tail.length;
  const marker = `\n…[truncated ${omitted} characters of ${input.length} total]…\n`;
  return {
    value: tail ? `${head}${marker}${tail}` : `${head}${marker}`,
    truncated: true,
    originalLength: input.length,
  };
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

  const additions = after.split("\n").length - before.split("\n").length;
  const deletions = additions < 0 ? Math.abs(additions) : 0;
  await cb({ path, additions: Math.max(0, additions), deletions });
}
