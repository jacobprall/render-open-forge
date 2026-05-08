"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActiveSkillRef } from "@openforge/skills";

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

function defaultActiveFromLists(
  builtins: SkillSummary[],
  user: SkillSummary[],
  repo: SkillSummary[],
): ActiveSkillRef[] {
  const userDefaultSlugs = new Set(
    user.filter((s) => s.defaultEnabled).map((s) => s.slug),
  );
  const refs: ActiveSkillRef[] = [];
  for (const s of builtins) {
    if (s.defaultEnabled && !userDefaultSlugs.has(s.slug)) {
      refs.push({ source: "builtin", slug: s.slug });
    }
  }
  for (const s of user) {
    if (s.defaultEnabled) refs.push({ source: "user", slug: s.slug });
  }
  for (const s of repo) {
    refs.push({ source: "repo", slug: s.slug });
  }
  return refs;
}

class FetchError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new FetchError(r.status);
  return r.json() as Promise<T>;
}

const swrOptions = {
  onErrorRetry: (err: unknown, _key: string, _config: unknown, revalidate: (opts: { retryCount: number }) => void, { retryCount }: { retryCount: number }) => {
    if (err instanceof FetchError && err.status === 401) return;
    if (retryCount >= 3) return;
    setTimeout(() => revalidate({ retryCount }), 5000 * (retryCount + 1));
  },
};

export function NewSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRepo = searchParams.get("repo") ?? "";
  const initialBranch = searchParams.get("branch") ?? "";

  const [selectedRepo, setSelectedRepo] = useState(initialRepo);
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [isNewBranch, setIsNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [title, setTitle] = useState("");
  const [activeSkillKeys, setActiveSkillKeys] = useState<Set<string>>(new Set());
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [initialParamsApplied, setInitialParamsApplied] = useState(false);

  const {
    data: repos = [],
    isLoading: loadingRepos,
    error: reposErr,
  } = useSWR("/api/sessions/repos", (u) =>
    jsonFetcher<{ repos?: Repo[] }>(u).then((d) => d.repos ?? []),
    swrOptions,
  );

  const {
    data: branches = [],
    isLoading: loadingBranches,
    error: branchesErr,
  } = useSWR(
    selectedRepo ? `/api/sessions/repos/${encodeURIComponent(selectedRepo)}/branches` : null,
    (u) => jsonFetcher<{ branches?: Branch[] }>(u).then((d) => d.branches ?? []),
    swrOptions,
  );

  const { data: skillsPayload, isLoading: loadingSkills, error: skillsErr } = useSWR(
    selectedRepo ? `/api/skills?repo=${encodeURIComponent(selectedRepo)}` : null,
    async (u) => {
      const d = await jsonFetcher<{
        builtins?: SkillSummary[];
        user?: SkillSummary[];
        repo?: SkillSummary[];
      }>(u);
      return {
        builtins: d.builtins ?? [],
        user: d.user ?? [],
        repo: d.repo ?? [],
      };
    },
    swrOptions,
  );

  useEffect(() => {
    if (reposErr) setError("Failed to load repositories");
  }, [reposErr]);
  useEffect(() => {
    if (branchesErr) setError("Failed to load branches");
  }, [branchesErr]);
  useEffect(() => {
    if (skillsErr) setError("Failed to load skills");
  }, [skillsErr]);

  useEffect(() => {
    if (initialRepo && repos.some((r) => r.fullName === initialRepo)) {
      setSelectedRepo(initialRepo);
    }
  }, [initialRepo, repos]);

  useEffect(() => {
    if (!selectedRepo || branches.length === 0) return;
    const def = repos.find((r) => r.fullName === selectedRepo)?.defaultBranch ?? "main";
    if (!initialParamsApplied) {
      if (initialBranch && branches.some((b) => b.name === initialBranch)) {
        setSelectedBranch(initialBranch);
      } else {
        setSelectedBranch(def);
      }
      setInitialParamsApplied(true);
    } else {
      setSelectedBranch((prev) => prev || def);
    }
  }, [selectedRepo, branches, repos, initialBranch, initialParamsApplied]);

  useEffect(() => {
    if (!skillsPayload) {
      if (!selectedRepo) setActiveSkillKeys(new Set());
      return;
    }
    const refs = defaultActiveFromLists(skillsPayload.builtins, skillsPayload.user, skillsPayload.repo);
    setActiveSkillKeys(new Set(refs.map(skillKey)));
  }, [skillsPayload, selectedRepo]);

  const allSkills = useMemo(() => {
    if (!skillsPayload) return [];
    // Deduplicate by slug: prefer user > repo > builtin
    const seen = new Map<string, SkillSummary>();
    for (const s of skillsPayload.builtins) seen.set(s.slug, s);
    for (const s of skillsPayload.repo) seen.set(s.slug, s);
    for (const s of skillsPayload.user) seen.set(s.slug, s);
    return Array.from(seen.values());
  }, [skillsPayload]);

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
          throw new Error((data as { error?: string }).error ?? "Failed to create session");
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
          Start an agent session — choose which skills apply for this run.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error ? (
          <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Repository</label>
          {loadingRepos ? (
            <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
          ) : (
            <select
              value={selectedRepo}
              onChange={(e) => {
                setSelectedRepo(e.target.value);
                setInitialParamsApplied(false);
              }}
              className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              required
            >
              <option value="" className="bg-zinc-900 text-zinc-400">
                Select a repository…
              </option>
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
              className="text-xs text-accent-text transition hover:text-accent"
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                disabled={!selectedRepo}
                required
              />
              {!selectedRepo ? (
                <p className="mt-1.5 text-xs text-zinc-500">Select a repository first</p>
              ) : null}
            </>
          ) : loadingBranches && selectedRepo ? (
            <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
          ) : (
            <>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                disabled={!selectedRepo}
                required
              >
                <option value="" className="bg-zinc-900 text-zinc-400">
                  Select a branch…
                </option>
                {branches.map((b) => (
                  <option key={b.name} value={b.name} className="bg-zinc-900 text-zinc-100">
                    {b.name}
                  </option>
                ))}
              </select>
              {!selectedRepo && !loadingBranches && (
                <p className="mt-1.5 text-xs text-zinc-500">Select a repository first</p>
              )}
            </>
          )}
          {isNewBranch && selectedBranch ? (
            <p className="mt-1.5 text-xs text-zinc-500">
              Will be created from <span className="text-zinc-400">{selectedBranch}</span>
            </p>
          ) : null}
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
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Sessions start as &quot;New session&quot; until you send a message; then we generate a short title with
            Haiku.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">Skills for this session</label>
          <p className="mb-3 text-xs text-zinc-500">
            Toggle instructions merged into the agent system prompt. Manage personal skills in{" "}
            <a href="/settings/skills" className="text-accent-text hover:text-accent">
              Settings → Skills
            </a>
            .
          </p>
          {!selectedRepo ? (
            <p className="text-sm text-zinc-500">Select a repository to load skills.</p>
          ) : loadingSkills ? (
            <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
          ) : skillsPayload == null ? (
            <p className="text-sm text-zinc-500">Could not load skills.</p>
          ) : allSkills.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No skills found. Your openforge-skills repo will seed built-ins automatically.
            </p>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setSkillsExpanded((v) => !v)}
                className="mb-2 flex w-full items-center gap-2 text-left text-sm text-zinc-300 transition hover:text-zinc-100"
              >
                <svg
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${skillsExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                <span>
                  {activeSkillKeys.size} of {allSkills.length} skills selected
                </span>
              </button>
              {skillsExpanded && (
                <div className="flex flex-col gap-2">
                  {allSkills.map((s) => {
                    const k = skillKey({ source: s.source, slug: s.slug });
                    const on = activeSkillKeys.has(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggleSkill({ source: s.source, slug: s.slug })}
                        className={`rounded-lg border px-3 py-2 text-left transition ${
                          on
                            ? "border-accent/60 bg-accent-bg"
                            : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-zinc-100">{s.name}</div>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {s.source}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">{s.description}</div>
                      </button>
                    );
                  })}
                </div>
              )}
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
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create Session"}
          </button>
        </div>
      </form>
    </div>
  );
}
