import type { AssistantPart } from "@openforge/ui";

export interface Message {
  id: string;
  role: "user" | "assistant";
  parts: AssistantPart[];
  createdAt: string;
}

interface UseChatMessagesOptions {
  sessionId: string;
  modelId: string;
  activeRunId: string | null;
  isStreaming: boolean;
  startStreaming: () => void;
  finishStreaming: () => void;
  askUserPrompt: { question: string; options: string[]; toolCallId?: string } | null;
  setAskUserPrompt: React.Dispatch<
    React.SetStateAction<{ question: string; options: string[]; toolCallId?: string } | null>
  >;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function useChatMessages({
  sessionId,
  modelId,
  activeRunId,
  isStreaming,
  startStreaming,
  finishStreaming,
  askUserPrompt,
  setAskUserPrompt,
  setError,
  setMessages,
}: UseChatMessagesOptions) {
  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: content }],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setError(null);

    try {
      const body: Record<string, unknown> = { content };
      if (modelId) body.modelId = modelId;

      const res = await fetch(`/api/sessions/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to send message" }));
        setError(data.error ?? "Failed to send message");
        return;
      }

      setError(null);
      startStreaming();
    } catch {
      setError("Network error — failed to send message");
    }
  }

  async function submitAskUserReply(answer: string) {
    if (!askUserPrompt?.toolCallId || !activeRunId) return;
    setAskUserPrompt(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolCallId: askUserPrompt.toolCallId,
          message: answer,
          runId: activeRunId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Reply failed" }));
        setError(data.error ?? "Failed to send reply to agent");
      }
    } catch {
      setError("Network error — reply failed");
    }
  }

  async function stopStreaming() {
    try {
      await fetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
    } catch {
      // best effort
    }
    finishStreaming();
  }

  return { sendMessage, submitAskUserReply, stopStreaming };
}
