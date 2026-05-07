"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";

interface Member {
  id: number;
  login: string;
  avatar_url: string;
  full_name?: string;
}

async function membersFetcher(url: string): Promise<Member[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? "Failed to load members");
  }
  return res.json() as Promise<Member[]>;
}

export function MembersList({ org }: { org: string }) {
  const base = `/api/orgs/${encodeURIComponent(org)}/members`;
  const {
    data: members = [],
    isLoading: loading,
    error: swrError,
    mutate,
  } = useSWR<Member[]>(base, membersFetcher, { revalidateOnFocus: true });

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadError = swrError instanceof Error ? swrError.message : swrError ? String(swrError) : null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to add member");
      setMessage(`Added ${trimmed} to ${org}.`);
      setUsername("");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(login: string) {
    setRemoving(login);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: login }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to remove member");
      setMessage(`Removed ${login} from ${org}.`);
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void handleAdd(e)}
        className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <h2 className="text-base font-semibold text-zinc-100">Add Member</h2>
        <div className="mt-3 flex gap-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={adding || !username.trim()}
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add Member"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-base font-semibold text-zinc-100">Current Members</h2>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-400">{loadError}</p>
        ) : members.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No members found.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Image
                    src={member.avatar_url}
                    alt={member.login}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full bg-zinc-700"
                  />
                  <div>
                    <span className="text-sm font-medium text-zinc-200">{member.full_name || member.login}</span>
                    {member.full_name ? (
                      <span className="ml-2 text-xs text-zinc-500">@{member.login}</span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={removing === member.login}
                  onClick={() => void handleRemove(member.login)}
                  className="rounded-md border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                >
                  {removing === member.login ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message ? (
        <p className="text-sm text-emerald-400" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
