"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface ExternalRepo {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  clone_url: string;
}

interface ConnectionInfo {
  connectionId: string;
  repos: ExternalRepo[];
}

type Provider = "github" | "gitlab";

const providers: { id: Provider; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "gitlab", label: "GitLab" },
];

export default function ImportPage() {
  const [activeProvider, setActiveProvider] = useState<Provider>("github");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, ConnectionInfo>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<
    Array<{ name: string; ok: boolean; error?: string }>
  >([]);

  const fetchRepos = useCallback(async (provider: Provider) => {
    if (data[provider]) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sync/${provider}/repos`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to fetch repos");
        return;
      }
      setData((prev) => ({
        ...prev,
        [provider]: { connectionId: json.connectionId, repos: json.repos },
      }));
    } catch {
      setError("Network error fetching repos");
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    fetchRepos(activeProvider);
  }, [activeProvider, fetchRepos]);

  const repos = data[activeProvider]?.repos ?? [];
  const filtered = repos.filter(
    (r) =>
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSelect = (fullName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.full_name)));
    }
  };

  const handleImport = async () => {
    const toImport = repos.filter((r) => selected.has(r.full_name));
    if (toImport.length === 0) return;

    setImporting(true);
    setImportResults([]);

    const results: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const repo of toImport) {
      try {
        const res = await fetch("/api/repos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clone_addr: repo.clone_url,
            repo_name: repo.name,
            mirror: true,
            service: activeProvider,
            sync_connection_id: data[activeProvider]?.connectionId,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          results.push({ name: repo.full_name, ok: true });
        } else {
          results.push({
            name: repo.full_name,
            ok: false,
            error: json.error ?? "Import failed",
          });
        }
      } catch {
        results.push({ name: repo.full_name, ok: false, error: "Network error" });
      }
    }

    setImportResults(results);
    setImporting(false);
    setSelected(new Set());
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <Link
          href="/repos"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to repositories
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Import repositories</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Import repositories from your connected GitHub or GitLab accounts into Forgejo.
        </p>
      </div>

      {/* Provider tabs */}
      <div className="mb-6 flex gap-2">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setActiveProvider(p.id);
              setSelected(new Set());
              setSearch("");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeProvider === p.id
                ? "bg-accent text-white"
                : "border border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Import results */}
      {importResults.length > 0 && (
        <div className="mb-6 space-y-2">
          {importResults.map((r) => (
            <div
              key={r.name}
              className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
                r.ok
                  ? "border-accent/20 bg-accent-bg text-accent"
                  : "border-danger/20 bg-danger/10 text-red-300"
              }`}
            >
              <span>{r.name}</span>
              <span>{r.ok ? "Imported" : r.error}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
          {error.includes("Connect") && (
            <Link href="/settings/connections" className="ml-2 underline hover:text-red-200">
              Go to Settings
            </Link>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
          <span className="ml-3 text-sm text-zinc-400">Loading repositories...</span>
        </div>
      )}

      {!loading && !error && repos.length > 0 && (
        <>
          {/* Search + select all */}
          <div className="mb-4 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-accent/50 focus:ring-1 focus:ring-accent/25"
            />
            <button
              onClick={toggleAll}
              className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
            >
              {selected.size === filtered.length && filtered.length > 0
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>

          {/* Repo list */}
          <div className="space-y-2">
            {filtered.map((repo) => (
              <label
                key={repo.full_name}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                  selected.has(repo.full_name)
                    ? "border-accent/40 bg-accent-bg"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(repo.full_name)}
                  onChange={() => toggleSelect(repo.full_name)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-accent-text focus:ring-accent/25"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">
                      {repo.full_name}
                    </span>
                    {repo.private && (
                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                        Private
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {repo.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-zinc-600">{repo.default_branch}</span>
              </label>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              No repositories match your search.
            </p>
          )}

          {/* Import button */}
          {selected.size > 0 && (
            <div className="mt-6 flex items-center justify-end">
              <button
                onClick={handleImport}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Importing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Import {selected.size} {selected.size === 1 ? "repository" : "repositories"}
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && !error && repos.length === 0 && !data[activeProvider] && (
        <p className="py-12 text-center text-sm text-zinc-500">
          Connect your {activeProvider === "github" ? "GitHub" : "GitLab"} account in{" "}
          <Link href="/settings/connections" className="text-accent-text hover:underline">
            Settings
          </Link>{" "}
          to import repositories.
        </p>
      )}
    </div>
  );
}
