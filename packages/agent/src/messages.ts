import type { ModelMessage } from "ai";

/**
 * Convert job-level messages (user/assistant with raw content) into
 * AI SDK ModelMessage format.
 *
 * This is the fallback path when modelMessages aren't available.
 * For assistant messages with structured parts, we extract text content
 * rather than JSON.stringify-ing the entire parts array.
 */
export function jobMessagesToModelMessages(
  messages: Array<{ role: "user" | "assistant"; content: unknown }>,
): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === "user") {
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? (m.content as Array<{ type: string; text?: string }>)
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text!)
              .join("\n")
          : JSON.stringify(m.content);
      return { role: "user" as const, content: text };
    }

    // For assistant messages, extract text parts rather than stringifying
    // the full parts array (which includes tool_call/tool_result objects
    // that the model can't interpret as a simple string).
    if (Array.isArray(m.content)) {
      const parts = m.content as Array<{ type: string; text?: string }>;
      const textParts = parts.filter((p) => p.type === "text" && p.text).map((p) => p.text!);
      if (textParts.length > 0) {
        return { role: "assistant" as const, content: textParts.join("\n") };
      }
    }
    return {
      role: "assistant" as const,
      content: typeof m.content === "string" ? m.content : "(tool interaction — see history)",
    };
  }) as ModelMessage[];
}

/**
 * Basic sanitization — remove empty messages, trim whitespace.
 */
export function sanitizeMessages(messages: ModelMessage[], _chatId?: string): ModelMessage[] {
  return messages.filter((m) => {
    if (typeof m.content === "string") return m.content.trim().length > 0;
    return true;
  });
}
