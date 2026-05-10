import type { AssistantPart } from "@openforge/ui";
import { apiFetch } from "@/lib/api-fetch";

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

      const { ok, data } = await apiFetch<{ error?: string }>(
        `/api/sessions/${sessionId}/message`,
        { method: "POST", body },
      );

      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to send message");
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
      const { ok, data } = await apiFetch<{ error?: string }>(
        `/api/sessions/${sessionId}/reply`,
        {
          method: "POST",
          body: {
            toolCallId: askUserPrompt.toolCallId,
            message: answer,
            runId: activeRunId,
          },
        },
      );
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to send reply to agent");
      }
    } catch {
      setError("Network error — reply failed");
    }
  }

  async function stopStreaming() {
    try {
      await apiFetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
    } catch {
      // best effort
    }
    finishStreaming();
  }

  return { sendMessage, submitAskUserReply, stopStreaming };
}
