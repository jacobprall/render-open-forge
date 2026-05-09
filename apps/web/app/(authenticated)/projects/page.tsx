"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Layers, Plus, FolderOpen, MessageCircle, Clock } from "lucide-react";

interface ProjectRepo {
  id: string;
  repoPath: string;
  isPrimary: boolean;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  isScratch: boolean;
  sessionCount: number;
  repos: ProjectRepo[];
  instructions: string | null;
  updatedAt: string;
  createdAt: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
};

export default function ProjectsPage() {
  const { data: projects, isLoading, error, mutate } = useSWR<Project[]>("/api/projects", fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, startCreating] = useTransition();

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    startCreating(async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) return;
      setNewName("");
      setShowCreate(false);
      mutate();
    });
  }, [newName, mutate]);

  const realProjects = projects?.filter((p) => !p.isScratch) ?? [];
  const scratchProject = projects?.find((p) => p.isScratch);

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Projects</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Organize sessions, repos, and infrastructure
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {showCreate && (
          <div className="mb-6 border border-stroke-subtle bg-surface-1 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Project name..."
                className="w-full border border-stroke-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none sm:flex-1"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="min-h-10 flex-1 bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50 sm:flex-none"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); }}
                  className="min-h-10 px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex items-center justify-center py-20 text-danger">
            Failed to load projects
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20 text-text-tertiary">
            Loading...
          </div>
        ) : realProjects.length === 0 && !scratchProject ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Layers className="mb-4 h-12 w-12 text-text-tertiary" />
            <p className="text-text-secondary">No projects yet</p>
            <p className="mt-1 text-sm text-text-tertiary">
              Projects are auto-created when you start sessions with repos
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {realProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {scratchProject && (
              <ProjectCard key={scratchProject.id} project={scratchProject} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const updatedAt = new Date(project.updatedAt);
  const timeAgo = getTimeAgo(updatedAt);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="content-auto group border border-stroke-subtle bg-surface-1 p-5 transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-text-primary group-hover:text-accent-text">
            {project.name}
          </h3>
        </div>
        {project.isScratch && (
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            Scratch
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-text-tertiary">
        {project.repos.length > 0 && (
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {project.repos.length} {project.repos.length === 1 ? "repo" : "repos"}
          </span>
        )}
        <span className="flex items-center gap-1">
          <MessageCircle className="h-3 w-3" />
          {project.sessionCount} {project.sessionCount === 1 ? "session" : "sessions"}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </span>
      </div>

      {project.repos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.repos.slice(0, 3).map((repo) => (
            <span
              key={repo.id}
              className="inline-block bg-surface-3 px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {repo.repoPath}
            </span>
          ))}
          {project.repos.length > 3 && (
            <span className="text-[11px] text-text-tertiary">
              +{project.repos.length - 3} more
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
