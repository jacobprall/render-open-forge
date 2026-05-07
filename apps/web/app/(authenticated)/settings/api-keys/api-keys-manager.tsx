"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

interface ApiKeyRow {
  id: string;
  provider: "anthropic" | "openai";
  scope: "platform" | "user";
  label: string;
  keyHint: string;
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiKeysPayload {
  encryptionConfigured: boolean;
  isAdmin: boolean;
  envFallback: { anthropic: boolean; openai: boolean };
  keys: ApiKeyRow[];
}

async function fetcher(url: string): Promise<ApiKeysPayload> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to load API keys");
  return r.json() as Promise<ApiKeysPayload>;
}

export function ApiKeysManager() {
  const { data, error, isLoading, mutate } = useSWR("/api/settings/api-keys", fetcher);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [scope, setScope] = useState<"platform" | "user">("user");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (data && !data.isAdmin && scope === "platform") {
      setScope("user");
    }
  }, [data, scope]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const r = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          scope,
          label: label.trim() || undefined,
          apiKey,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setFormError(typeof j.error === "string" ? j.error : "Save failed");
        return;
      }
      setApiKey("");
      setLabel("");
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this stored API key?")) return;
    const r = await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      alert(typeof j.error === "string" ? j.error : "Delete failed");
      return;
    }
    await mutate();
  }

  if (isLoading || !data) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (error) {
    return <p className="text-sm text-danger">Could not load API keys.</p>;
  }

  return (
    <div className="space-y-8">
      {!data.encryptionConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Add{" "}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">ENCRYPTION_KEY</code> to{" "}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">
            apps/web/.env.local
          </code>{" "}
          and{" "}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">
            apps/agent/.env
          </code>{" "}
          (identical values; generate with{" "}
          <code className="text-xs text-zinc-300">openssl rand -hex 32</code>) before saving keys here.
        </div>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="text-sm font-semibold text-zinc-200">Environment fallback</h3>
        <p className="mt-1 text-xs text-zinc-500">
          <code className="text-zinc-400">ANTHROPIC_API_KEY</code> and{" "}
          <code className="text-zinc-400">OPENAI_API_KEY</code> apply when no database key is resolved for
          that provider (personal → platform → environment).
        </p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          <li>Anthropic: {data.envFallback.anthropic ? "set in environment" : "not set in environment"}</li>
          <li>OpenAI: {data.envFallback.openai ? "set in environment" : "not set in environment"}</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">Stored keys</h3>
        {data.keys.length === 0 ? (
          <p className="text-sm text-zinc-500">No keys stored in the database yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-100">{k.label}</span>
                    <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                      {k.provider}
                    </span>
                    <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                      {k.scope}
                    </span>
                    {!k.isValid && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                        Invalid
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-zinc-500">Key {k.keyHint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(k.id)}
                  className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-red-500/40 hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h3 className="mb-4 text-sm font-semibold text-zinc-200">Add or replace key</h3>
        <p className="mb-4 text-xs text-zinc-500">
          One key per provider per scope. Saving again updates the existing row. Keys are validated with the
          provider before they are stored.
        </p>
        {formError && (
          <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {formError}
          </div>
        )}
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as "anthropic" | "openai")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "platform" | "user")}
                disabled={!data.isAdmin}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              >
                <option value="user">Personal (this account)</option>
                {data.isAdmin ? <option value="platform">Platform (all users)</option> : null}
              </select>
              {!data.isAdmin && (
                <p className="mt-1 text-[11px] text-zinc-600">Only administrators can add platform keys.</p>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={provider === "anthropic" ? "Anthropic" : "OpenAI"}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              required
              minLength={8}
            />
            <p className="mt-1 text-xs text-zinc-600">
              Stored encrypted (AES-256-GCM). The full key is never shown again after saving.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving || !data.encryptionConfigured}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save key"}
          </button>
        </form>
      </section>
    </div>
  );
}
