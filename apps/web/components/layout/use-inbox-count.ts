"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const POLL_FALLBACK_MS = 60_000;

export function useInboxCount() {
  const [count, setCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
      }
    } catch {
      // Silently ignore
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    function connectSSE() {
      if (!mounted) return;

      const es = new EventSource("/api/inbox/stream");
      eventSourceRef.current = es;

      es.addEventListener("count", (event) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(event.data);
          setCount(data.count ?? 0);
        } catch {
          // Malformed event
        }
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (!mounted) return;
        // Fall back to polling on SSE failure
        if (!fallbackTimerRef.current) {
          fetchCount();
          fallbackTimerRef.current = setInterval(fetchCount, POLL_FALLBACK_MS);
        }
        // Attempt to reconnect SSE after delay
        setTimeout(() => {
          if (mounted && !eventSourceRef.current) {
            if (fallbackTimerRef.current) {
              clearInterval(fallbackTimerRef.current);
              fallbackTimerRef.current = null;
            }
            connectSSE();
          }
        }, 10_000);
      };
    }

    fetchCount();
    connectSSE();

    return () => {
      mounted = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [fetchCount]);

  return { count, refresh: fetchCount };
}
