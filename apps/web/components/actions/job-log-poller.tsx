"use client";

import { useEffect, useState } from "react";

/** Polls Forgejo job logs via the web API (same auth cookies as the app). */
export function JobLogsPoller(props: {
  owner: string;
  repo: string;
  jobId: string;
  pollMs?: number;
}) {
  const { owner, repo, jobId, pollMs = 4000 } = props;
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const url = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${encodeURIComponent(jobId)}/logs`;

    async function load() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof (j as { error?: unknown }).error === "string"
              ? (j as { error: string }).error
              : `Logs request failed (${res.status})`,
          );
        }
        const t = await res.text();
        if (!cancelled) {
          setText(t);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    void load();

    timer = setInterval(() => {
      void load();
    }, pollMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [owner, repo, jobId, pollMs]);

  if (error) {
    return (
      <p className="text-sm text-red-400" role="status">
        {error}
      </p>
    );
  }

  return (
    <pre className="max-h-128 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
      {text || "Fetching logs…"}
    </pre>
  );
}
