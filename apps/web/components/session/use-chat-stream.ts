"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import { useEventSource } from "@/hooks/use-event-source";
import type { StreamEvent } from "@openforge/shared";
import type { AssistantPart } from "@openforge/ui";
import { appendStreamEvent } from "@openforge/ui";
import type { Message } from "./use-chat-messages";

export interface LiveFileChange {
  path: string;
  additions: number;
  deletions: number;
}

interface UseChatStreamOptions {
  sessionId: string;
  onFileChanges?: (files: LiveFileChange[]) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useChatStream({
  sessionId,
  onFileChanges,
  setMessages,
  setError,
}: UseChatStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingParts, setStreamingParts] = useState<AssistantPart[]>([]);
  const [askUserPrompt, setAskUserPrompt] = useState<{
    question: string;
    options: string[];
    toolCallId?: string;
  } | null>(null);
  const [liveFileChanges, setLiveFileChanges] = useState<LiveFileChange[]>([]);
  const [streamGeneration, setStreamGeneration] = useState(0);

  const streamUrl = useMemo(
    () => `/api/sessions/${sessionId}/stream?sg=${streamGeneration}`,
    [sessionId, streamGeneration],
  );

  const onFileChangesRef = useRef(onFileChanges);
  onFileChangesRef.current = onFileChanges;

  const pushLiveFileChange = useCallback((fp: string, additions: number, deletions: number) => {
    if (!fp) return;
    setLiveFileChanges((prev) => {
      const rest = prev.filter((x) => x.path !== fp);
      return [...rest, { path: fp, additions, deletions }].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
    });
  }, []);

  useEffect(() => {
    onFileChangesRef.current?.(liveFileChanges);
  }, [liveFileChanges]);

  const finishStreaming = useCallback(() => {
    setStreamingParts((parts) => {
      if (parts.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      return [];
    });
    setIsStreaming(false);
    setLiveFileChanges([]);
    onFileChangesRef.current?.([]);
  }, [setMessages]);

  const streamMessageRef = useRef<(event: MessageEvent) => void>(() => {});
  streamMessageRef.current = (event: MessageEvent) => {
    try {
      const raw = JSON.parse(event.data) as Record<string, unknown>;
      const type = raw.type as string;

      if (type === "connected" || type === "no_active_run") return;

      if (type === "ask_user") {
        setAskUserPrompt({
          question: (raw.question as string) ?? "",
          options: (raw.options as string[]) ?? [],
          toolCallId: raw.toolCallId as string | undefined,
        });
        return;
      }

      if (type === "file_changed") {
        startTransition(() => {
          setStreamingParts((prev) => appendStreamEvent(prev, raw as unknown as StreamEvent));
        });
        const fp = (raw.path as string) ?? "";
        pushLiveFileChange(fp, (raw.additions as number) ?? 0, (raw.deletions as number) ?? 0);
        return;
      }

      if (type === "done" || type === "aborted") {
        finishStreaming();
        return;
      }

      if (type === "error") {
        setError((raw.message as string) ?? "An error occurred");
        finishStreaming();
        return;
      }

      startTransition(() => {
        setStreamingParts((prev) => appendStreamEvent(prev, raw as unknown as StreamEvent));
      });
    } catch {
      // ignore parse errors
    }
  };

  const onStreamMessage = useCallback((e: MessageEvent) => {
    streamMessageRef.current(e);
  }, []);

  const streamErrorRef = useRef<() => void>(() => {});
  streamErrorRef.current = () => {
    finishStreaming();
  };
  const onStreamError = useCallback(() => {
    streamErrorRef.current();
  }, []);

  useEventSource({
    url: streamUrl,
    enabled: isStreaming,
    onMessage: onStreamMessage,
    onError: onStreamError,
    maxReconnectAttempts: 0,
  });

  const startStreaming = useCallback(() => {
    setStreamingParts([]);
    setStreamGeneration((g) => g + 1);
    setIsStreaming(true);
  }, []);

  return {
    isStreaming,
    streamingParts,
    liveFileChanges,
    askUserPrompt,
    setAskUserPrompt,
    startStreaming,
    finishStreaming,
    streamGeneration,
    setStreamGeneration,
  };
}
