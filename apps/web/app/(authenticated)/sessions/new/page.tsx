"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Repo = { id: number | string; fullName: string; defaultBranch: string; name: string };
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
  const [isNewBranch, setIsNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
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
      .then((data) => {
        const loaded: Repo[] = data.repos ?? [];
        setRepos(loaded);
        if (initialRepo && loaded.some((r) => r.fullName === initialRepo)) {
          setSelectedRepo(initialRepo);
        }
      })
      .catch(() => setError("Failed to load repositories"))
      .finally(() => setLoadingRepos(false));
  }, [initialRepo]);

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
          const defaultBranch = repos.find((r) => r.fullName === selectedRepo)?.defaultBranch ?? "main";
          setSelectedBranch(defaultBranch);
          setInitialParamsApplied(true);
        } else {
          const defaultBranch = repos.find((r) => r.fullName === selectedRepo)?.defaultBranch ?? "main";
          setSelectedBranch(defaultBranch);
        }
        setTitle(`${selectedRepo.split("/").pop()}/${selectedBranch || initialBranch || "main"}`);
      })
      .catch(() => setError("Failed to load branches"))
      .finally(() => setLoadingBranches(false));
  }, [selectedRepo, repos, initialBranch, initialParamsApplied]);

  useEffect(() => {
    const branch = isNewBranch ? newBranchName.trim() : selectedBranch;
    if (selectedRepo && branch) {
      setTitle(`${selectedRepo.split("/").pop()}/${branch}`);
    }
  }, [selectedBranch, selectedRepo, isNewBranch, newBranchName]);

  const effectiveBranch = isNewBranch ? newBranchName.trim() : selectedBranch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRepo || !effectiveBranch) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoPath: selectedRepo,
            branch: effectiveBranch,
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
              className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              required
            >
              <option value="" className="bg-zinc-900 text-zinc-400">Select a repository…</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.fullName} className="bg-zinc-900 text-zinc-100">
                  {repo.fullName}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300">Branch</label>
            <button
              type="button"
              onClick={() => {
                setIsNewBranch((v) => !v);
                setNewBranchName("");
              }}
              className="text-xs text-emerald-400 transition hover:text-emerald-300"
            >
              {isNewBranch ? "Use existing branch" : "+ New branch"}
            </button>
          </div>
          {isNewBranch ? (
            <>
              <input
                key="new-branch-input"
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="e.g. feature/my-branch"
                autoFocus
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                disabled={!selectedRepo}
                required
              />
              {!selectedRepo && (
                <p className="mt-1.5 text-xs text-zinc-500">Select a repository first</p>
              )}
            </>
          ) : loadingBranches ? (
            <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
          ) : (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              disabled={!selectedRepo}
              required
            >
              <option value="" className="bg-zinc-900 text-zinc-400">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.name} value={b.name} className="bg-zinc-900 text-zinc-100">
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {isNewBranch && selectedBranch && (
            <p className="mt-1.5 text-xs text-zinc-500">
              Will be created from <span className="text-zinc-400">{selectedBranch}</span>
            </p>
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
            disabled={isPending || !selectedRepo || !effectiveBranch}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Creating…" : "Create Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
