"use client";

import useSWR from "swr";

/** Polls CI job logs via the web API (same auth cookies as the app). */
export function JobLogsPoller(props: {
  owner: string;
  repo: string;
  jobId: string;
  pollMs?: number;
}) {
  const { owner, repo, jobId, pollMs = 4000 } = props;

  const url = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${encodeURIComponent(jobId)}/logs`;

  const { data: text = "", error } = useSWR(
    url,
    async (u) => {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof (j as { error?: unknown }).error === "string"
            ? (j as { error: string }).error
            : `Logs request failed (${res.status})`,
        );
      }
      return res.text();
    },
    { refreshInterval: pollMs },
  );

  if (error) {
    return (
      <p className="text-sm text-danger" role="status">
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  return (
    <pre className="max-h-128 overflow-auto whitespace-pre-wrap wrap-break-word border border-stroke-subtle bg-surface-0 p-4 font-mono text-xs leading-relaxed text-text-primary">
      {text || "Fetching logs…"}
    </pre>
  );
}
