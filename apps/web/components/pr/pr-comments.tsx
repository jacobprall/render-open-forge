"use client";

import { useState } from "react";
import useSWR from "swr";

interface Comment {
  id: number;
  body: string;
  user: { login: string; avatar_url?: string };
  path?: string;
  line?: number;
  resolved?: boolean;
  createdAt: string;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function commentsFetcher(url: string): Promise<Comment[]> {
  const res = await fetch(url, { cache: "no-store" });
  const j = (await res.json()) as { comments?: unknown[]; error?: string };
  if (!res.ok) throw new Error(j.error ?? "Load failed");
  return (j.comments ?? []) as Comment[];
}

export function PRComments({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: number;
}) {
  const [postError, setPostError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const base = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`;
  const commentsKey = `${base}/comments`;

  const {
    data: comments = [],
    isLoading: loading,
    error: swrError,
    mutate,
  } = useSWR(commentsKey, commentsFetcher, { revalidateOnFocus: true });

  const loadError = swrError instanceof Error ? swrError.message : swrError ? String(swrError) : null;
  const error = postError ?? loadError;

  async function post() {
    if (!newComment.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(`${base}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Post failed");
      setNewComment("");
      await mutate();
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  async function toggleResolve(commentId: number, currentlyResolved: boolean) {
    try {
      await fetch(`${base}/comments/${commentId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unresolve: currentlyResolved }),
      });
      await mutate();
    } catch {
      // silently fail, user can retry
    }
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading comments…</p>;
  }

  const inlineComments = comments.filter((c) => c.path);
  const generalComments = comments.filter((c) => !c.path);

  return (
    <div className="space-y-6">
      {/* General comments */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-text-tertiary">
          Comments ({comments.length})
        </h4>
        {comments.length === 0 && (
          <p className="text-sm text-text-tertiary">No comments yet.</p>
        )}

        {generalComments.map((c) => (
          <div
            key={`gen-${c.id}`}
            className="border border-stroke-subtle bg-surface-1/50 p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{c.user.login}</span>
                <span className="text-xs text-text-tertiary" suppressHydrationWarning>{relTime(c.createdAt)}</span>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary">{c.body}</pre>
          </div>
        ))}

        {/* Inline comments grouped by file */}
        {inlineComments.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
              Inline comments
            </h5>
            {inlineComments.map((c) => (
              <div
                key={`inline-${c.id}`}
                className={`border p-4 ${
                  c.resolved
                    ? "border-stroke-subtle/50 bg-surface-1/30 opacity-60"
                    : "border-amber-500/20 bg-amber-500/5"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{c.user.login}</span>
                    <span className="text-xs text-text-tertiary" suppressHydrationWarning>{relTime(c.createdAt)}</span>
                    {c.path && (
                      <span className="bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-tertiary">
                        {c.path}
                        {c.line != null ? `:${c.line}` : ""}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleResolve(c.id, !!c.resolved)}
                    className="text-xs text-text-tertiary hover:text-text-primary"
                  >
                    {c.resolved ? "Unresolve" : "Resolve"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-text-secondary">{c.body}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post new comment */}
      <div className="border border-stroke-subtle bg-surface-1/50 p-4">
        <textarea
          className="w-full resize-none border border-stroke-default bg-surface-2/50 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
          rows={3}
          placeholder="Add a comment…"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between">
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <button
            type="button"
            onClick={() => void post()}
            disabled={posting || !newComment.trim()}
            className="ml-auto bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {posting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
