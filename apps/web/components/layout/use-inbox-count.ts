"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const POLL_INTERVAL_MS = 120_000;
const INITIAL_RECONNECT_MS = 10_000;
const MAX_RECONNECT_MS = 120_000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useInboxCount() {
  const [count, setCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const fetchCount = useCallback(async (): Promise<boolean> => {
    if (stoppedRef.current) return false;
    try {
      const res = await fetch("/api/inbox/count");
      if (res.status === 401) {
        stopAll();
        return false;
      }
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
        return true;
      }
    } catch {
      // Network error — don't stop, just skip
    }
    return true;
  }, [stopAll]);

  useEffect(() => {
    let mounted = true;

    function connectSSE() {
      if (!mounted || stoppedRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        // Give up on SSE, fall back to polling only
        if (!fallbackTimerRef.current) {
          fallbackTimerRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
        }
        return;
      }

      const es = new EventSource("/api/inbox/stream");
      eventSourceRef.current = es;

      es.addEventListener("count", (event) => {
        if (!mounted) return;
        reconnectAttemptsRef.current = 0;
        try {
          const data = JSON.parse(event.data);
          setCount(data.count ?? 0);
        } catch {
          // Malformed event
        }
      });

      es.onopen = () => {
        reconnectAttemptsRef.current = 0;
        if (fallbackTimerRef.current) {
          clearInterval(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (!mounted || stoppedRef.current) return;

        reconnectAttemptsRef.current++;
        const delay = Math.min(
          INITIAL_RECONNECT_MS * Math.pow(2, reconnectAttemptsRef.current - 1),
          MAX_RECONNECT_MS,
        );

        // Check auth before scheduling reconnect
        fetch("/api/inbox/count").then((res) => {
          if (!mounted) return;
          if (res.status === 401) {
            stopAll();
            return;
          }
          if (res.ok) {
            res.json().then((data) => setCount(data.count ?? 0));
          }
          // Start fallback poll while SSE is down
          if (!fallbackTimerRef.current && !stoppedRef.current) {
            fallbackTimerRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
          }
          setTimeout(() => {
            if (mounted && !stoppedRef.current && !eventSourceRef.current) {
              connectSSE();
            }
          }, delay);
        }).catch(() => {
          if (mounted && !stoppedRef.current) {
            setTimeout(() => connectSSE(), delay);
          }
        });
      };
    }

    fetchCount().then((authed) => {
      if (authed && mounted) connectSSE();
    });

    return () => {
      mounted = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [fetchCount, stopAll]);

  return { count, refresh: fetchCount };
}
