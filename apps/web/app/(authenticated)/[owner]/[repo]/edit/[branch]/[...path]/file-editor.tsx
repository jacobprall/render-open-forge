"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FileEditorProps {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  initialContent: string;
  sha: string;
  isNew: boolean;
}

export function FileEditor({
  owner,
  repo,
  branch,
  filePath,
  initialContent,
  sha,
  isNew,
}: FileEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState(
    isNew ? `Create ${filePath}` : `Update ${filePath}`,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!message.trim()) return;
    setSaving(true);
    setError(null);

    const res = await fetch(
      `/api/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, message, sha: sha || undefined, branch }),
      },
    );

    if (res.ok) {
      router.push(`/${owner}/${repo}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save file");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="h-[500px] w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-accent focus:outline-none"
        spellCheck={false}
      />
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-zinc-400">
            Commit message
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !message.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save & Commit"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
