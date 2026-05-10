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
          setResult({ type: "error", message: typeof data.error === "string" ? data.error : "Install failed" });
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
      <h3 className="mb-1 text-sm font-medium text-text-secondary">
        Install skill from URL
      </h3>
      <p className="mb-3 text-xs text-text-tertiary">
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
          className="flex-1 border border-stroke-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none transition-colors duration-(--of-duration-instant) focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="shrink-0 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-(--of-duration-instant) hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Installing\u2026" : "Install"}
        </button>
      </form>
      {result && (
        <div
          className={`mt-2 border px-3 py-2 text-xs ${
            result.type === "success"
              ? "border-accent/20 bg-accent-bg text-accent-text"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {result.message}
        </div>
      )}
    </section>
  );
}
