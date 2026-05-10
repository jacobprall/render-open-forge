"use client";

import {
  useReducer,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import { useEventSource } from "@/hooks/use-event-source";
import { STREAM_EVENT } from "@/lib/stream-events";
import { apiFetch } from "@/lib/api-fetch";
import type { StreamEvent } from "@openforge/shared";
import {
  chatReducer,
  initialChatState,
  type Message,
  type ChatStatus,
  type LiveFileChange,
  type AskUserPrompt,
} from "./chat-reducer";

const MAX_SEEN_IDS = 5000;
const MAX_NO_RUN_RETRIES = 15;
const NO_RUN_RETRY_DELAY_MS = 1000;

export type { Message, LiveFileChange, AskUserPrompt, ChatStatus };

interface UseAgentChatOptions {
  sessionId: string;
  modelId: string;
  activeRunId?: string | null;
  initialMessages?: Message[];
  onFileChanges?: (files: LiveFileChange[]) => void;
}

export interface UseAgentChatReturn {
  messages: Message[];
  streamingParts: import("@openforge/ui").AssistantPart[];
  status: ChatStatus;
  error: string | null;
  liveFileChanges: LiveFileChange[];
  askUserPrompt: AskUserPrompt | null;
  activeRunId: string | null;
  sendMessage: (content: string) => Promise<void>;
  submitAskUserReply: (answer: string) => Promise<void>;
  stopStreaming: () => Promise<void>;
  startStreaming: (runId?: string) => void;
}

export function useAgentChat({
  sessionId,
  modelId,
  activeRunId: externalRunId,
  initialMessages = [],
  onFileChanges,
}: UseAgentChatOptions): UseAgentChatReturn {
  const [state, dispatch] = useReducer(
    chatReducer,
    initialMessages,
    initialChatState,
  );

  const seenIds = useRef(new Set<string>());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFileChangesRef = useRef(onFileChanges);
  onFileChangesRef.current = onFileChanges;

  useEffect(() => {
    if (externalRunId) {
      dispatch({ type: "SET_ACTIVE_RUN_ID", runId: externalRunId });
    }
  }, [externalRunId]);

  useEffect(() => {
    onFileChangesRef.current?.(state.liveFileChanges);
  }, [state.liveFileChanges]);

  const isActive = state.status === "streaming" || state.status === "waitingForRun";
  const streamUrl = useMemo(
    () => (sessionId && isActive ? `/api/sessions/${sessionId}/stream` : null),
    [sessionId, isActive],
  );

  const evictSeenIds = useCallback(() => {
    if (seenIds.current.size <= MAX_SEEN_IDS) return;
    const entries = Array.from(seenIds.current);
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    for (const id of toRemove) {
      seenIds.current.delete(id);
    }
  }, []);

  const handleSSEMessage = useCallback((event: MessageEvent) => {
    const eventId: string | undefined = (
      event as MessageEvent & { lastEventId?: string }
    ).lastEventId;

    if (eventId) {
      if (seenIds.current.has(eventId)) return;
      seenIds.current.add(eventId);
      evictSeenIds();
    }

    const rawData =
      typeof event.data === "string" ? event.data : String(event.data ?? "");

    try {
      const raw = JSON.parse(rawData) as Record<string, unknown>;
      delete raw._sid;
      const type = raw.type as string;

      if (type === STREAM_EVENT.CONNECTED) return;

      if (type === STREAM_EVENT.NO_ACTIVE_RUN) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

        startTransition(() => {
          dispatch({ type: "NO_ACTIVE_RUN" });
        });

        if (state.noRunRetries < MAX_NO_RUN_RETRIES) {
          retryTimerRef.current = setTimeout(() => {
            esRef.current?.reconnect();
          }, NO_RUN_RETRY_DELAY_MS);
        }
        return;
      }

      startTransition(() => {
        dispatch({ type: "STREAM_EVENT", event: raw as unknown as StreamEvent });
      });
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[SSE parse error]", e, rawData.slice(0, 200));
      }
    }
  }, [evictSeenIds, state.noRunRetries]);

  const handleSSEError = useCallback(() => {
    startTransition(() => {
      dispatch({ type: "FINISH_STREAMING" });
    });
  }, []);

  const es = useEventSource({
    url: streamUrl,
    enabled: isActive,
    onMessage: handleSSEMessage,
    onError: handleSSEError,
    maxReconnectAttempts: 3,
  });
  const esRef = useRef(es);
  esRef.current = es;

  const startStreaming = useCallback((runId?: string) => {
    seenIds.current.clear();
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    dispatch({ type: "START_STREAMING", runId });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isActive) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: content }],
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "ADD_USER_MESSAGE", message: userMessage });
      dispatch({ type: "CLEAR_ERROR" });

      try {
        const body: Record<string, unknown> = { content };
        if (modelId) body.modelId = modelId;

        const { ok, data } = await apiFetch<{ error?: string }>(
          `/api/sessions/${sessionId}/message`,
          { method: "POST", body },
        );

        if (!ok) {
          dispatch({
            type: "SET_ERROR",
            error:
              typeof data.error === "string"
                ? data.error
                : "Failed to send message",
          });
          return;
        }

        dispatch({ type: "CLEAR_ERROR" });
        startStreaming();
      } catch {
        dispatch({ type: "SET_ERROR", error: "Network error -- failed to send message" });
      }
    },
    [sessionId, modelId, isActive, startStreaming],
  );

  const submitAskUserReply = useCallback(
    async (answer: string) => {
      const runId = state.activeRunId;
      const toolCallId = state.askUserPrompt?.toolCallId;
      if (!toolCallId || !runId) return;

      dispatch({ type: "SET_ASK_USER", prompt: null });

      try {
        const { ok, data } = await apiFetch<{ error?: string }>(
          `/api/sessions/${sessionId}/reply`,
          {
            method: "POST",
            body: { toolCallId, message: answer, runId },
          },
        );
        if (!ok) {
          dispatch({
            type: "SET_ERROR",
            error:
              typeof data.error === "string"
                ? data.error
                : "Failed to send reply to agent",
          });
        }
      } catch {
        dispatch({ type: "SET_ERROR", error: "Network error -- reply failed" });
      }
    },
    [sessionId, state.activeRunId, state.askUserPrompt?.toolCallId],
  );

  const stopStreaming = useCallback(async () => {
    try {
      await apiFetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
    } catch {
      // best effort
    }
    dispatch({ type: "FINISH_STREAMING" });
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return {
    messages: state.messages,
    streamingParts: state.streamingParts,
    status: state.status,
    error: state.error,
    liveFileChanges: state.liveFileChanges,
    askUserPrompt: state.askUserPrompt,
    activeRunId: state.activeRunId,
    sendMessage,
    submitAskUserReply,
    stopStreaming,
    startStreaming,
  };
}
