"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function InvitePasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = (await res.json()) as { ok?: boolean; email?: string; error?: string };

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not complete invite");
        return;
      }

      if (!data.email) {
        setError("Invite completed but email was missing; sign in manually.");
        return;
      }

      const signInResult = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError("Password saved but sign-in failed. Try signing in from the home page.");
        return;
      }

      window.location.href = "/repos";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-8 w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm text-text-tertiary">
          Choose a password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-stroke-default bg-surface-2 px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-sm text-text-tertiary">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-stroke-default bg-surface-2 px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading || !password || !confirm}
        className="w-full bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Saving…" : "Create account"}
      </button>
    </form>
  );
}
