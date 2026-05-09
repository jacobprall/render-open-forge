"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

type Props = {
  owner: string
  repo: string
}

interface SecretEntry {
  name: string
}

export function SecretsSettings({ owner, repo }: Props) {
  const base = useMemo(
    () => `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/secrets`,
    [owner, repo],
  )

  const [secrets, setSecrets] = useState<SecretEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newValue, setNewValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(base, { cache: "no-store" })
      const json = (await res.json()) as { secrets?: SecretEntry[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to load secrets")
      setSecrets(json.secrets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed || !newValue) return

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`${base}/${encodeURIComponent(trimmed)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newValue }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to save secret")
      setMessage(`Secret "${trimmed}" saved.`)
      setNewName("")
      setNewValue("")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(name: string) {
    setDeleting(name)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`${base}/${encodeURIComponent(name)}`, { method: "DELETE" })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to delete secret")
      setMessage(`Secret "${name}" deleted.`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="border border-stroke-subtle bg-surface-1 p-6">
      <h3 className="text-base font-semibold text-text-primary">Repository Secrets</h3>
      <p className="mt-2 text-sm text-text-tertiary">
        Secrets are encrypted and available to CI workflows as environment variables.
        Values are write-only — they cannot be viewed after creation.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-text-tertiary">Loading…</p>
      ) : (
        <>
          {secrets.length > 0 ? (
            <ul className="mt-4 divide-y divide-stroke-subtle border border-stroke-subtle">
              {secrets.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    <span className="font-mono text-sm text-text-primary">{s.name}</span>
                  </div>
                  <button
                    type="button"
                    disabled={deleting === s.name}
                    onClick={() => void handleDelete(s.name)}
                    className="border border-stroke-default px-3 py-1 text-xs font-medium text-text-tertiary transition-colors duration-(--of-duration-instant) hover:border-danger/40 hover:text-danger disabled:opacity-50"
                  >
                    {deleting === s.name ? "Deleting…" : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-text-tertiary">No secrets configured yet.</p>
          )}

          <form onSubmit={(e) => void handleAdd(e)} className="mt-5 space-y-3">
            <h4 className="text-sm font-medium text-text-secondary">Add a secret</h4>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="SECRET_NAME"
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                className="flex-1 border border-stroke-default bg-surface-2 px-3 py-2 font-mono text-sm text-text-primary placeholder-text-tertiary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                type="password"
                placeholder="Value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="flex-1 border border-stroke-default bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary transition-colors duration-(--of-duration-instant) focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={saving || !newName.trim() || !newValue}
                className="shrink-0 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add secret"}
              </button>
            </div>
          </form>
        </>
      )}

      {message && (
        <p className="mt-3 text-sm text-accent-text" role="status">{message}</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">{error}</p>
      )}
    </div>
  )
}
