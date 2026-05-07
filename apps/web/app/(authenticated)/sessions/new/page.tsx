"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Repo = { id: number; full_name: string; default_branch: string };
type Branch = { name: string };

const workflowModes = [
  { value: "full", label: "Full", desc: "Understand → Spec → Execute → Verify → Deliver" },
  { value: "standard", label: "Standard", desc: "Execute → Verify → Deliver" },
  { value: "fast", label: "Fast", desc: "Execute → Deliver" },
  { value: "yolo", label: "YOLO", desc: "Execute only" },
] as const;

export default function NewSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRepo = searchParams.get("repo") ?? "";
  const initialBranch = searchParams.get("branch") ?? "";

  const [repos, setRepos] = useState<Repo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedRepo, setSelectedRepo] = useState(initialRepo);
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [title, setTitle] = useState("");
  const [workflowMode, setWorkflowMode] = useState<string>("standard");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);

  useEffect(() => {
    fetch("/api/sessions/repos")
      .then((r) => r.json())
      .then((data) => setRepos(data.repos ?? []))
      .catch(() => setError("Failed to load repositories"))
      .finally(() => setLoadingRepos(false));
  }, []);

  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      return;
    }
    setLoadingBranches(true);
    fetch(`/api/sessions/repos/${encodeURIComponent(selectedRepo)}/branches`)
      .then((r) => r.json())
      .then((data) => {
        setBranches(data.branches ?? []);
        if (!initialParamsApplied && initialBranch) {
          setSelectedBranch(initialBranch);
          setInitialParamsApplied(true);
        } else if (!initialParamsApplied) {
          const defaultBranch = repos.find((r) => r.full_name === selectedRepo)?.default_branch ?? "main";
          setSelectedBranch(defaultBranch);
          setInitialParamsApplied(true);
        } else {
          const defaultBranch = repos.find((r) => r.full_name === selectedRepo)?.default_branch ?? "main";
          setSelectedBranch(defaultBranch);
        }
        setTitle(`${selectedRepo.split("/").pop()}/${selectedBranch || initialBranch || "main"}`);
      })
      .catch(() => setError("Failed to load branches"))
      .finally(() => setLoadingBranches(false));
  }, [selectedRepo, repos, initialBranch, initialParamsApplied]);

  useEffect(() => {
    if (selectedRepo && selectedBranch) {
      setTitle(`${selectedRepo.split("/").pop()}/${selectedBranch}`);
    }
  }, [selectedBranch, selectedRepo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRepo || !selectedBranch) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoPath: selectedRepo,
            branch: selectedBranch,
            title,
            workflowMode,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to create session");
        }
        const { sessionId } = await res.json();
        router.push(`/sessions/${sessionId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">New Session</h1>
        <p className="text-sm text-zinc-400">
          Start an agent coding session on a repository
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Repository
          </label>
          {loadingRepos ? (
            <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
          ) : (
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              required
            >
              <option value="">Select a repository…</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Branch
          </label>
          {loadingBranches ? (
            <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
          ) : (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              disabled={!selectedRepo}
              required
            >
              <option value="">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Workflow Mode
          </label>
          <div className="grid grid-cols-2 gap-3">
            {workflowModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setWorkflowMode(mode.value)}
                className={`rounded-lg border p-3 text-left transition ${
                  workflowMode === mode.value
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="text-sm font-medium">{mode.label}</div>
                <div className="mt-1 text-xs text-zinc-400">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !selectedRepo || !selectedBranch}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Creating…" : "Create Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
