"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function InstallSkillForm() {
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/skills/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        const data = await res.json();

        if (!res.ok) {
          setResult({ type: "error", message: data.error ?? "Install failed" });
          return;
        }

        setResult({
          type: "success",
          message: `Installed "${data.name}" as skills/${data.slug}.md`,
        });
        setUrl("");
        router.refresh();
      } catch (err) {
        setResult({
          type: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    });
  }

  return (
    <section>
      <h3 className="mb-1 text-sm font-medium text-zinc-300">
        Install skill from URL
      </h3>
      <p className="mb-3 text-xs text-zinc-500">
        Paste a link to a skill markdown file (GitHub, raw URL, or any public
        URL). The file will be saved to your personal skills repo.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo/blob/main/SKILL.md"
          required
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
        />
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {isPending ? "Installing\u2026" : "Install"}
        </button>
      </form>
      {result && (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
            result.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          {result.message}
        </div>
      )}
    </section>
  );
}
