"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Member {
  id: number;
  login: string;
  avatar_url: string;
}

export default function OrgMembersPage() {
  const params = useParams<{ org: string }>();
  const org = params.org;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/members`);
      if (res.ok) setMembers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMembers();
  }, [org]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;

    setAdding(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
    });

    if (res.ok) {
      setUsername("");
      await fetchMembers();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to add member");
    }
    setAdding(false);
  }

  async function handleRemove(memberLogin: string) {
    if (!confirm(`Remove ${memberLogin} from ${org}?`)) return;

    const res = await fetch(`/api/orgs/${encodeURIComponent(org)}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: memberLogin }),
    });

    if (res.ok) {
      await fetchMembers();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to remove member");
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold text-zinc-100">
        Team Management
      </h1>
      <p className="mb-6 text-sm text-zinc-400">
        Manage members of <span className="font-medium text-zinc-200">{org}</span>
      </p>

      {/* Add member form */}
      <form
        onSubmit={handleAdd}
        className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <h2 className="mb-3 text-sm font-medium text-zinc-200">Add Member</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || !username.trim()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </form>

      {/* Members list */}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading members...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-zinc-400">No members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.avatar_url}
                alt={m.login}
                className="h-8 w-8 rounded-full bg-zinc-700"
              />
              <span className="flex-1 text-sm font-medium text-zinc-100">
                {m.login}
              </span>
              <button
                onClick={() => handleRemove(m.login)}
                className="rounded-md border border-red-500/30 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
