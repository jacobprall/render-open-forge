"use client";

import { useState, useCallback, useTransition, use, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  FolderOpen,
  MessageCircle,
  Settings,
  Plus,
  X,
  Trash2,
  Save,
} from "lucide-react";

interface ProjectRepo {
  id: string;
  repoPath: string;
  forgeType: string | null;
  defaultBranch: string | null;
  isPrimary: boolean;
}

interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  isScratch: boolean;
  instructions: string | null;
  config: Record<string, unknown> | null;
  sessionCount: number;
  repos: ProjectRepo[];
  createdAt: string;
  updatedAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: project, isLoading, mutate } = useSWR<ProjectDetail>(`/api/projects/${id}`, fetcher);
  const [tab, setTab] = useState<"overview" | "settings">("overview");

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
        Loading...
      </div>
    );
  }

  if (!project || ("error" in project)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
        Project not found
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/projects" className="text-text-tertiary hover:text-text-primary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {project.name}
            </h1>
            {project.isScratch && (
              <span className="text-xs uppercase tracking-wider text-text-tertiary">
                Scratch project
              </span>
            )}
          </div>
        </div>

        <div className="mb-6 flex gap-1 border-b border-stroke-subtle">
          <button
            onClick={() => startTransition(() => setTab("overview"))}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "overview"
                ? "border-b-2 border-accent text-accent-text"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => startTransition(() => setTab("settings"))}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "settings"
                ? "border-b-2 border-accent text-accent-text"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Settings className="mr-1.5 inline h-3.5 w-3.5" />
            Settings
          </button>
        </div>

        {tab === "overview" ? (
          <OverviewTab project={project} mutate={mutate} />
        ) : (
          <SettingsTab project={project} mutate={mutate} onDelete={() => router.push("/projects")} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  project,
  mutate,
}: {
  project: ProjectDetail;
  mutate: () => void;
}) {
  const [addingRepo, setAddingRepo] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState("");

  const handleAddRepo = useCallback(async () => {
    if (!newRepoPath.trim()) return;
    await fetch(`/api/projects/${project.id}/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath: newRepoPath.trim() }),
    });
    setNewRepoPath("");
    setAddingRepo(false);
    mutate();
  }, [newRepoPath, project.id, mutate]);

  const handleRemoveRepo = useCallback(
    async (repoPath: string) => {
      await fetch(`/api/projects/${project.id}/repos/${encodeURIComponent(repoPath)}`, {
        method: "DELETE",
      });
      mutate();
    },
    [project.id, mutate],
  );

  return (
    <div className="space-y-6">
      {/* Repos */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">
            Linked Repos
          </h2>
          <button
            onClick={() => setAddingRepo(true)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-text"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {addingRepo && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoFocus
              value={newRepoPath}
              onChange={(e) => setNewRepoPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
              placeholder="owner/repo"
              className="w-full border border-stroke-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none sm:flex-1"
            />
            <div className="flex gap-2">
              <button onClick={handleAddRepo} className="min-h-10 bg-accent px-4 py-2 text-sm text-white">
                Add
              </button>
              <button
                onClick={() => { setAddingRepo(false); setNewRepoPath(""); }}
                className="flex min-h-10 min-w-10 items-center justify-center text-text-tertiary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {project.repos.length === 0 ? (
          <p className="text-sm text-text-tertiary">No repos linked yet</p>
        ) : (
          <div className="space-y-2">
            {project.repos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between border border-stroke-subtle bg-surface-0 px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-text-tertiary" />
                  <span className="text-sm text-text-primary">{repo.repoPath}</span>
                  {repo.isPrimary && (
                    <span className="text-[10px] uppercase tracking-wider text-accent">primary</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveRepo(repo.repoPath)}
                  className="flex min-h-10 min-w-10 items-center justify-center text-text-tertiary hover:text-red-500"
                  title="Remove repo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent sessions */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          Sessions
        </h2>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <MessageCircle className="h-4 w-4" />
          {project.sessionCount} total {project.sessionCount === 1 ? "session" : "sessions"}
        </div>
        <Link
          href={(() => {
            const params = new URLSearchParams({ project: project.id });
            const primary = project.repos.find((r) => r.isPrimary) ?? project.repos[0];
            if (primary) {
              params.set("repo", primary.repoPath);
              if (primary.defaultBranch) params.set("branch", primary.defaultBranch);
            }
            return `/sessions?${params.toString()}`;
          })()}
          className="mt-2 inline-block text-sm text-accent hover:text-accent-text"
        >
          View sessions &rarr;
        </Link>
      </section>

      {/* Instructions preview */}
      {project.instructions && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
            Agent Instructions
          </h2>
          <div className="border border-stroke-subtle bg-surface-0 p-4 text-sm text-text-secondary whitespace-pre-wrap">
            {project.instructions}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsTab({
  project,
  mutate,
  onDelete,
}: {
  project: ProjectDetail;
  mutate: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    startSaving(async () => {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, instructions: instructions || undefined }),
      });
      setSaved(true);
      mutate();
      setTimeout(() => setSaved(false), 2000);
    });
  }, [name, instructions, project.id, mutate]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete project "${project.name}"? This will also delete all its sessions.`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onDelete();
  }, [project, onDelete]);

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Project Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-stroke-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Agent Instructions
        </label>
        <p className="mb-2 text-xs text-text-tertiary">
          Persistent rules for the agent, inherited by every session in this project.
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={8}
          placeholder="e.g. Always use TypeScript strict mode. Follow our coding conventions at docs/conventions.md."
          className="w-full border border-stroke-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>

      {!project.isScratch && (
        <div className="border-t border-stroke-subtle pt-6">
          <h3 className="mb-2 text-sm font-semibold text-red-500">Danger Zone</h3>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete Project
          </button>
        </div>
      )}
    </div>
  );
}
