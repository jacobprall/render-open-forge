"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActiveSkillRef } from "@render-open-forge/skills";

type Repo = { id: number | string; fullName: string; defaultBranch: string; name: string };
type Branch = { name: string };

type SkillSummary = {
  source: "builtin" | "user" | "repo";
  slug: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
};

function skillKey(s: Pick<ActiveSkillRef, "source" | "slug">): string {
  return `${s.source}:${s.slug}`;
}

function defaultActiveFromLists(builtins: SkillSummary[], user: SkillSummary[], repo: SkillSummary[]): ActiveSkillRef[] {
  const refs: ActiveSkillRef[] = [];
  for (const s of builtins) {
    if (s.defaultEnabled) refs.push({ source: "builtin", slug: s.slug });
  }
  for (const s of user) {
    if (s.defaultEnabled) refs.push({ source: "user", slug: s.slug });
  }
  for (const s of repo) {
    refs.push({ source: "repo", slug: s.slug });
  }
  return refs;
}

export function NewSessionForm() {
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
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [skillsPayload, setSkillsPayload] = useState<{
    builtins: SkillSummary[];
    user: SkillSummary[];
    repo: SkillSummary[];
  } | null>(null);
  const [activeSkillKeys, setActiveSkillKeys] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);

  const allSkills = useMemo(() => {
    if (!skillsPayload) return [];
    return [...skillsPayload.builtins, ...skillsPayload.user, ...skillsPayload.repo];
  }, [skillsPayload]);

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
      setSkillsPayload(null);
      setActiveSkillKeys(new Set());
      return;
    }
    setLoadingBranches(true);
    fetch(`/api/sessions/repos/${encodeURIComponent(selectedRepo)}/branches`)
      .then((r) => r.json())
      .then((data) => {
        const list: Branch[] = data.branches ?? [];
        setBranches(list);
        if (!initialParamsApplied) {
          const def = repos.find((r) => r.fullName === selectedRepo)?.defaultBranch ?? "main";
          if (initialBranch && list.some((b) => b.name === initialBranch)) {
            setSelectedBranch(initialBranch);
          } else {
            setSelectedBranch(def);
          }
          setInitialParamsApplied(true);
        } else {
          const def = repos.find((r) => r.fullName === selectedRepo)?.defaultBranch ?? "main";
          setSelectedBranch((prev) => prev || def);
        }
      })
      .catch(() => setError("Failed to load branches"))
      .finally(() => setLoadingBranches(false));
  }, [selectedRepo, repos, initialBranch, initialParamsApplied]);

  useEffect(() => {
    if (!selectedRepo) return;
    fetch(`/api/skills?repo=${encodeURIComponent(selectedRepo)}`)
      .then((r) => r.json())
      .then((data: { builtins?: SkillSummary[]; user?: SkillSummary[]; repo?: SkillSummary[] }) => {
        const builtins = data.builtins ?? [];
        const user = data.user ?? [];
        const repo = data.repo ?? [];
        setSkillsPayload({ builtins, user, repo });
        const refs = defaultActiveFromLists(builtins, user, repo);
        setActiveSkillKeys(new Set(refs.map(skillKey)));
      })
      .catch(() => setError("Failed to load skills"));
  }, [selectedRepo]);

  const effectiveBranch = isNewBranch ? newBranchName.trim() : selectedBranch;

  function toggleSkill(ref: ActiveSkillRef) {
    const k = skillKey(ref);
    setActiveSkillKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function activeSkillRefs(): ActiveSkillRef[] {
    return allSkills
      .filter((s) => activeSkillKeys.has(skillKey({ source: s.source, slug: s.slug })))
      .map((s) => ({ source: s.source, slug: s.slug }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRepo || !effectiveBranch) return;
    setError(null);

    const activeSkills = activeSkillRefs();
    if (activeSkills.length === 0) {
      setError("Select at least one skill");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoPath: selectedRepo,
            branch: effectiveBranch,
            ...(title.trim() ? { title: title.trim() } : {}),
            activeSkills,
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

  function groupLabel(source: string): string {
    if (source === "builtin") return "Built-in";
    if (source === "user") return "Your skills";
    return "Repository";
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">New Session</h1>
        <p className="text-sm text-zinc-400">
          Start an agent session — choose which skills apply for this run.
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
              onChange={(e) => {
                setSelectedRepo(e.target.value);
                setInitialParamsApplied(false);
              }}
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
            Title <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leave blank — named automatically after your first message (Claude Haiku)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Sessions start as &quot;New session&quot; until you send a message; then we generate a short title with Haiku.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Skills for this session
          </label>
          <p className="mb-3 text-xs text-zinc-500">
            Toggle instructions merged into the agent system prompt. Manage personal skills in{" "}
            <a href="/settings/skills" className="text-emerald-400 hover:text-emerald-300">
              Settings → Skills
            </a>
            .
          </p>
          {!selectedRepo ? (
            <p className="text-sm text-zinc-500">Select a repository to load skills.</p>
          ) : !skillsPayload ? (
            <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
          ) : allSkills.length === 0 ? (
            <p className="text-sm text-zinc-500">No skills found. Your forge-skills repo will seed built-ins automatically.</p>
          ) : (
            <div className="space-y-4">
              {(["builtin", "user", "repo"] as const).map((source) => {
                const list = allSkills.filter((s) => s.source === source);
                if (list.length === 0) return null;
                return (
                  <div key={source}>
                    <p className="mb-2 mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {groupLabel(source)}
                    </p>
                    <div className="flex flex-col gap-2">
                      {list.map((s) => {
                        const k = skillKey({ source: s.source, slug: s.slug });
                        const on = activeSkillKeys.has(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleSkill({ source: s.source, slug: s.slug })}
                            className={`rounded-lg border px-3 py-2 text-left transition ${
                              on
                                ? "border-emerald-500/60 bg-emerald-500/10"
                                : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                            }`}
                          >
                            <div className="text-sm font-medium text-zinc-100">{s.name}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">{s.description}</div>
                            <div className="mt-1 font-mono text-[10px] text-zinc-600">
                              {s.source}/{s.slug}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
