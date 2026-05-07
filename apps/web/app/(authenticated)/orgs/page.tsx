"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Org {
  id: number;
  username: string;
  full_name: string;
  avatar_url: string;
  description: string;
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState("");
  const [fullName, setFullName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchOrgs() {
    const res = await fetch("/api/orgs");
    if (res.ok) {
      setOrgs(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchOrgs();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim()) return;

    setCreating(true);
    setError(null);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: login.trim(),
        fullName: fullName.trim() || undefined,
        description: description.trim() || undefined,
      }),
    });

    if (res.ok) {
      setLogin("");
      setFullName("");
      setDescription("");
      await fetchOrgs();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create organization");
    }
    setCreating(false);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-zinc-100">Organizations</h1>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <h2 className="mb-4 text-lg font-medium text-zinc-200">
          Create Organization
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Login (required)
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="my-org"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="My Organization"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-zinc-400">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={creating || !login.trim()}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Organization"}
        </button>
      </form>

      {/* Org list */}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading organizations...</p>
      ) : orgs.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No organizations yet. Create one above.
        </p>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <Image
                src={org.avatar_url}
                alt={org.username}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full bg-zinc-700"
              />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-zinc-100">
                  {org.full_name || org.username}
                </h3>
                <p className="text-xs text-zinc-400">@{org.username}</p>
                {org.description && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {org.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
