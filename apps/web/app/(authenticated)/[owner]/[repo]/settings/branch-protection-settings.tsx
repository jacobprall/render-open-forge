"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

function ruleMatchesBranch(rule: Record<string, unknown>, branch: string) {
  return rule.rule_name === branch || rule.branch_name === branch;
}

/** Minimal Forgejo/Gitea-compatible rule for POST `/branch_protections`. */
export function defaultProtectedBranchRule(branch: string): Record<string, unknown> {
  return {
    rule_name: branch,
    branch_name: branch,
    enable_force_push: false,
    required_approvals: 1,
    block_on_rejected_reviews: true,
  };
}

export function BranchProtectionSettings(props: Props) {
  const { owner, repo, defaultBranch } = props;
  const base = useMemo(
    () => `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branch-protection`,
    [owner, repo],
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [protectedDefault, setProtectedDefault] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const j = (await res.json()) as { protections?: unknown; error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? "Failed to load branch protections");
      }
      const list = Array.isArray(j.protections) ? j.protections : [];
      const has = list.some(
        (r) => typeof r === "object" && r !== null && ruleMatchesBranch(r as Record<string, unknown>, defaultBranch),
      );
      setProtectedDefault(has);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [base, defaultBranch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaultProtectedBranchRule(defaultBranch)),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to create rule");
      setMessage(`Branch ${defaultBranch} is now protected with required approvals (1).`);
      setProtectedDefault(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const delUrl = `${base}/${encodeURIComponent(defaultBranch)}`;
      const res = await fetch(delUrl, { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to delete rule");
      setMessage(`Removed protection rule for ${defaultBranch}.`);
      setProtectedDefault(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h3 className="text-base font-semibold text-zinc-100">Branch protection</h3>
      <p className="mt-2 text-sm text-zinc-400">
        Applies a basic rule on the Forgejo repo: disallow force-push and require one approval before merge for the
        default branch ({defaultBranch}). Fine-tune policies in Forgejo if needed.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {protectedDefault ? (
            <>
              <span className="rounded-full bg-accent-bg px-2.5 py-1 text-xs font-medium text-accent">
                {defaultBranch} is protected
              </span>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() => void disable()}
              >
                Remove protection
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              onClick={() => void enable()}
            >
              Protect {defaultBranch}
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="mt-3 text-sm text-accent-text" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
