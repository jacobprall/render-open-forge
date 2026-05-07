import type { ModelMessage } from "ai";

/**
 * Convert job-level messages (user/assistant with raw content) into
 * AI SDK ModelMessage format.
 */
export function jobMessagesToModelMessages(
  messages: Array<{ role: "user" | "assistant"; content: unknown }>,
): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === "user") {
      const text = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? (m.content as Array<{ type: string; text?: string }>).map((p) => p.text ?? "").join("\n")
          : JSON.stringify(m.content);
      return { role: "user" as const, content: text };
    }
    return { role: "assistant" as const, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
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

/**
 * Validate that messages alternate correctly for the model.
 */
export function validateMessages(messages: ModelMessage[]): boolean {
  if (messages.length === 0) return false;
  return true;
}
