"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChatStream } from "./use-chat-stream";
import { useChatMessages } from "./use-chat-messages";
import type { Message } from "./use-chat-messages";
import type { LiveFileChange } from "./use-chat-stream";
import { MessageArea } from "./message-list";
import { ChatInput } from "./chat-input";

export type { Message } from "./use-chat-messages";
export type { LiveFileChange } from "./use-chat-stream";

interface ChatPanelProps {
  sessionId: string;
  activeRunId: string | null;
  initialMessages: Message[];
  modelId: string;
  onFileChanges?: (files: LiveFileChange[]) => void;
}

export function ChatPanel({
  sessionId,
  activeRunId,
  initialMessages,
  modelId,
  onFileChanges,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const stream = useChatStream({ sessionId, onFileChanges, setMessages, setError });
  const { sendMessage, submitAskUserReply, stopStreaming } = useChatMessages({
    sessionId,
    modelId,
    activeRunId,
    isStreaming: stream.isStreaming,
    startStreaming: stream.startStreaming,
    finishStreaming: stream.finishStreaming,
    askUserPrompt: stream.askUserPrompt,
    setAskUserPrompt: stream.setAskUserPrompt,
    setError,
    setMessages,
  });

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, stream.streamingParts, scrollToBottom]);

  const pendingAsk = useMemo(() => {
    if (!activeRunId && !stream.isStreaming) return null;
    for (let i = stream.streamingParts.length - 1; i >= 0; i--) {
      const p = stream.streamingParts[i];
      if (p?.type === "ask_user" && p.toolCallId) return p;
    }
    for (let mi = messages.length - 1; mi >= 0; mi--) {
      const m = messages[mi];
      if (m?.role !== "assistant") continue;
      for (let j = m.parts.length - 1; j >= 0; j--) {
        const p = m.parts[j];
        if (p?.type === "ask_user" && p.toolCallId) return p;
      }
    }
    return null;
  }, [activeRunId, stream.isStreaming, stream.streamingParts, messages]);

  function handleAskUserResponse(answer: string) {
    if (stream.askUserPrompt?.toolCallId && activeRunId) {
      void submitAskUserReply(answer);
      return;
    }
    void sendMessage(answer);
  }

  const askResolved = stream.askUserPrompt ?? pendingAsk;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-(--of-space-md) py-(--of-space-xl)">
        <div className="mx-auto max-w-2xl flex flex-col gap-(--of-space-lg)">
          <MessageArea
            messages={messages}
            streamingParts={stream.streamingParts}
            isStreaming={stream.isStreaming}
            liveFileChanges={stream.liveFileChanges}
            askResolved={askResolved}
            onAskUserResponse={handleAskUserResponse}
            error={error}
          />
          <div ref={messagesEndRef} />
        </div>
      </div>
      <ChatInput
        isStreaming={stream.isStreaming}
        onSend={(content) => void sendMessage(content)}
        onStop={() => void stopStreaming()}
      />
    </div>
  );
}
