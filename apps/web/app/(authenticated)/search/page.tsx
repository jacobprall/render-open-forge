"use client";

import { useState } from "react";
import Link from "next/link";

interface RepoResult {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string;
  private: boolean;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RepoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query.trim())}`,
    );
    if (res.ok) {
      const data = await res.json();
      setResults(data);
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">Search</h1>

      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repositories..."
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-accent focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {loading && (
        <p className="text-sm text-zinc-400">Searching...</p>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-sm text-zinc-400">No repositories found.</p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((repo) => (
            <Link
              key={repo.id}
              href={`/${repo.owner.login}/${repo.name}`}
              className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-100">
                  {repo.full_name}
                </h3>
                {repo.private && (
                  <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    Private
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="mt-1 text-xs text-zinc-400">
                  {repo.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
