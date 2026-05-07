"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface UseEventSourceOptions {
  url: string | null;
  onMessage: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onOpen?: (event: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enabled?: boolean;
}

interface UseEventSourceReturn {
  status: "idle" | "connecting" | "connected" | "disconnected" | "error";
  close: () => void;
  reconnect: () => void;
}

export function useEventSource({
  url,
  onMessage,
  onError,
  onOpen,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
  enabled = true,
}: UseEventSourceOptions): UseEventSourceReturn {
  const [status, setStatus] = useState<UseEventSourceReturn["status"]>("idle");
  const esRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url || !enabled) return;

    cleanup();
    setStatus("connecting");

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = (event) => {
      if (!isMounted.current) return;
      reconnectAttempts.current = 0;
      setStatus("connected");
      onOpen?.(event);
    };

    es.onmessage = (event) => {
      if (!isMounted.current) return;
      onMessage(event);
    };

    es.onerror = (event) => {
      if (!isMounted.current) return;
      onError?.(event);

      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          reconnectTimer.current = setTimeout(() => {
            if (isMounted.current) connect();
          }, reconnectInterval * reconnectAttempts.current);
        } else {
          setStatus("error");
        }
      }
    };
  }, [url, enabled, cleanup, onMessage, onError, onOpen, reconnectInterval, maxReconnectAttempts]);

  useEffect(() => {
    isMounted.current = true;
    if (url && enabled) {
      connect();
    }
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [url, enabled, connect, cleanup]);

  const close = useCallback(() => {
    cleanup();
    setStatus("disconnected");
  }, [cleanup]);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return { status, close, reconnect };
}
