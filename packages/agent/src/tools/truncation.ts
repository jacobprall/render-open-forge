export const MAX_BASH_STREAM_CHARS = 16_000;
export const MAX_READ_FILE_CHARS = 80_000;
export const MAX_GREP_MATCHES = 150;
export const MAX_GREP_MATCH_LINE_CHARS = 400;

export interface TruncatedString {
  value: string;
  truncated: boolean;
  originalLength: number;
}

export type TruncationMode = "head-and-tail" | "head" | "tail";

export function truncateLargeString(
  input: string,
  max: number,
  mode: TruncationMode = "head-and-tail",
): TruncatedString {
  if (input.length <= max) {
    return { value: input, truncated: false, originalLength: input.length };
  }

  const omitted = input.length - max;

  switch (mode) {
    case "head": {
      const marker = `\n…[truncated ${omitted} characters of ${input.length} total]…\n`;
      return { value: `${input.slice(0, max)}${marker}`, truncated: true, originalLength: input.length };
    }
    case "tail": {
      const marker = `\n…[truncated ${omitted} characters of ${input.length} total]…\n`;
      return { value: `${marker}${input.slice(-max)}`, truncated: true, originalLength: input.length };
    }
    case "head-and-tail":
    default: {
      const headLen = Math.floor(max * 0.7);
      const tailLen = Math.max(0, max - headLen - 80);
      const head = input.slice(0, headLen);
      const tail = tailLen > 0 ? input.slice(-tailLen) : "";
      const actualOmitted = input.length - head.length - tail.length;
      const marker = `\n…[truncated ${actualOmitted} characters of ${input.length} total]…\n`;
      return {
        value: tail ? `${head}${marker}${tail}` : `${head}${marker}`,
        truncated: true,
        originalLength: input.length,
      };
    }
  }
}
