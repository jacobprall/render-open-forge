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
  resetLastEventId: () => void;
}

function sseUrlWithLastEventId(baseUrl: string, lastEventId: string): string {
  const u = new URL(baseUrl, window.location.href);
  u.searchParams.set("lastEventId", lastEventId);
  return u.toString();
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
  const lastEventIdRef = useRef<string | null>(null);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);

  onMessageRef.current = onMessage;
  onErrorRef.current = onError;
  onOpenRef.current = onOpen;

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

    const lid = lastEventIdRef.current;
    const resolvedUrl =
      lid != null && lid !== ""
        ? sseUrlWithLastEventId(url, lid)
        : url;

    const es = new EventSource(resolvedUrl);
    esRef.current = es;

    es.onopen = (event) => {
      if (!isMounted.current) return;
      reconnectAttempts.current = 0;
      setStatus("connected");
      onOpenRef.current?.(event);
    };

    es.onmessage = (event) => {
      if (!isMounted.current) return;
      if (event.lastEventId) {
        lastEventIdRef.current = event.lastEventId;
      }
      onMessageRef.current(event);
    };

    es.onerror = (event) => {
      if (!isMounted.current) return;
      onErrorRef.current?.(event);

      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");

        // Probe the URL to distinguish auth failure from transient errors
        fetch(url, { method: "HEAD" }).then((res) => {
          if (!isMounted.current) return;
          if (res.status === 401 || res.status === 403) {
            setStatus("error");
            return;
          }
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            reconnectTimer.current = setTimeout(() => {
              if (isMounted.current) connect();
            }, reconnectInterval * reconnectAttempts.current);
          } else {
            setStatus("error");
          }
        }).catch(() => {
          if (!isMounted.current) return;
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            reconnectTimer.current = setTimeout(() => {
              if (isMounted.current) connect();
            }, reconnectInterval * reconnectAttempts.current);
          } else {
            setStatus("error");
          }
        });
      }
    };
  }, [url, enabled, cleanup, reconnectInterval, maxReconnectAttempts]);

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

  const resetLastEventId = useCallback(() => {
    lastEventIdRef.current = null;
  }, []);

  return { status, close, reconnect, resetLastEventId };
}
