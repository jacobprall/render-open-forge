"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GitBranch, ChevronDown, Search } from "lucide-react";
import useSWR from "swr";

interface Repo {
  id: number | string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate?: boolean;
}

interface Branch {
  name: string;
}

interface RepoBranchPickerProps {
  value: { repo: string; branch: string } | null;
  onChange: (value: { repo: string; branch: string }) => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RepoBranchPicker({ value, onChange }: RepoBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"repo" | "branch">("repo");
  const [query, setQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: reposData } = useSWR<{ repos: Repo[] }>("/api/sessions/repos", fetcher);
  const repos = reposData?.repos ?? [];

  const branchPath = selectedRepo
    ? `/api/sessions/repos/${encodeURIComponent(selectedRepo.fullName)}/branches`
    : null;
  const { data: branchesData } = useSWR<{ branches: Branch[] }>(branchPath, fetcher);
  const branches = branchesData?.branches ?? [];

  const filteredRepos = query
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          r.fullName.toLowerCase().includes(query.toLowerCase()),
      )
    : repos;

  const filteredBranches = query
    ? branches.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    : branches;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, step]);

  const handleRepoSelect = useCallback(
    (repo: Repo) => {
      setSelectedRepo(repo);
      setQuery("");
      setStep("branch");
      onChange({ repo: repo.fullName, branch: repo.defaultBranch });
    },
    [onChange],
  );

  const handleBranchSelect = useCallback(
    (branch: string) => {
      if (selectedRepo) {
        onChange({ repo: selectedRepo.fullName, branch });
      }
      setOpen(false);
      setQuery("");
    },
    [selectedRepo, onChange],
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    setStep(value?.repo ? "branch" : "repo");
    setQuery("");
    if (value?.repo) {
      const match = repos.find((r) => r.fullName === value.repo);
      if (match) setSelectedRepo(match);
    }
  }, [value, repos]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 border border-stroke-subtle bg-surface-1 px-2.5 py-1 text-[13px] font-mono text-text-secondary transition-colors duration-(--of-duration-instant) hover:bg-surface-2 hover:text-text-primary"
      >
        <GitBranch className="h-3 w-3 shrink-0 text-text-tertiary" />
        {value ? (
          <span className="truncate max-w-[200px]">
            {value.repo} <span className="text-text-tertiary">:</span> {value.branch}
          </span>
        ) : (
          <span className="text-text-tertiary">Select repo</span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 border border-stroke-subtle bg-surface-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-stroke-subtle px-(--of-space-sm) py-(--of-space-xs)">
            <Search className="h-3 w-3 text-text-tertiary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={step === "repo" ? "Search repositories…" : "Search branches…"}
              className="flex-1 bg-transparent text-[13px] text-text-primary placeholder-text-tertiary outline-none"
            />
            {step === "branch" && selectedRepo && (
              <button
                type="button"
                onClick={() => {
                  setStep("repo");
                  setQuery("");
                }}
                className="text-[11px] text-accent-text transition-colors duration-(--of-duration-instant) hover:text-text-primary"
              >
                Change repo
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto">
            {step === "repo" ? (
              filteredRepos.length === 0 ? (
                <div className="px-(--of-space-md) py-(--of-space-lg) text-center text-[13px] text-text-tertiary">
                  {repos.length === 0 ? "Loading repositories…" : "No matching repositories"}
                </div>
              ) : (
                filteredRepos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => handleRepoSelect(repo)}
                    className={`flex w-full items-center gap-2 px-(--of-space-md) py-2 text-left text-[13px] transition-colors duration-(--of-duration-instant) hover:bg-surface-2 border-l-2 ${
                      value?.repo === repo.fullName
                        ? "border-l-accent bg-surface-2 text-text-primary"
                        : "border-l-transparent text-text-secondary"
                    }`}
                  >
                    <span className="truncate font-mono">{repo.fullName}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">
                      {repo.defaultBranch}
                    </span>
                  </button>
                ))
              )
            ) : filteredBranches.length === 0 ? (
              <div className="px-(--of-space-md) py-(--of-space-lg) text-center text-[13px] text-text-tertiary">
                {branches.length === 0 ? "Loading branches…" : "No matching branches"}
              </div>
            ) : (
              filteredBranches.map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  onClick={() => handleBranchSelect(branch.name)}
                  className={`flex w-full items-center gap-2 px-(--of-space-md) py-2 text-left text-[13px] transition-colors duration-(--of-duration-instant) hover:bg-surface-2 border-l-2 ${
                    value?.branch === branch.name
                      ? "border-l-accent bg-surface-2 text-text-primary"
                      : "border-l-transparent text-text-secondary"
                  }`}
                >
                  <GitBranch className="h-3 w-3 shrink-0 text-text-tertiary" />
                  <span className="truncate font-mono">{branch.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
