"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  type RowSelectionState,
} from "@tanstack/react-table";
import { DataTable } from "@/components/primitives/data-table";

interface ExternalRepo {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  clone_url: string;
}

interface ConnectionInfo {
  connectionId: string;
  repos: ExternalRepo[];
}

type Provider = "github" | "gitlab";

const providers: { id: Provider; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "gitlab", label: "GitLab" },
];

const columnHelper = createColumnHelper<ExternalRepo>();

const columns = [
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        className="h-4 w-4 rounded border-stroke-default bg-surface-2 text-accent focus:ring-accent/25"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        className="h-4 w-4 rounded border-stroke-default bg-surface-2 text-accent focus:ring-accent/25"
      />
    ),
    enableSorting: false,
    size: 40,
  }),
  columnHelper.accessor("full_name", {
    header: "Repository",
    cell: (info) => (
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-text-primary">
            {info.getValue()}
          </span>
          {info.row.original.private && (
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-text-tertiary">
              Private
            </span>
          )}
        </div>
        {info.row.original.description && (
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            {info.row.original.description}
          </p>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("default_branch", {
    header: "Branch",
    cell: (info) => (
      <span className="text-text-tertiary">{info.getValue()}</span>
    ),
    size: 120,
  }),
];

export default function ImportPage() {
  const [activeProvider, setActiveProvider] = useState<Provider>("github");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, ConnectionInfo>>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<
    Array<{ name: string; ok: boolean; error?: string }>
  >([]);

  const fetchRepos = useCallback(
    async (provider: Provider) => {
      if (data[provider]) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/sync/${provider}/repos`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to fetch repos");
          return;
        }
        setData((prev) => ({
          ...prev,
          [provider]: { connectionId: json.connectionId, repos: json.repos },
        }));
      } catch {
        setError("Network error fetching repos");
      } finally {
        setLoading(false);
      }
    },
    [data]
  );

  useEffect(() => {
    fetchRepos(activeProvider);
  }, [activeProvider, fetchRepos]);

  const repos = useMemo(
    () => data[activeProvider]?.repos ?? [],
    [data, activeProvider]
  );

  const selectedCount = Object.keys(rowSelection).length;

  const handleImport = async () => {
    const selectedNames = new Set(Object.keys(rowSelection));
    const toImport = repos.filter((r) => selectedNames.has(r.full_name));
    if (toImport.length === 0) return;

    setImporting(true);
    setImportResults([]);

    const results: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const repo of toImport) {
      try {
        const res = await fetch("/api/repos/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clone_addr: repo.clone_url,
            repo_name: repo.name,
            mirror: true,
            service: activeProvider,
            sync_connection_id: data[activeProvider]?.connectionId,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          results.push({ name: repo.full_name, ok: true });
        } else {
          results.push({
            name: repo.full_name,
            ok: false,
            error: json.error ?? "Import failed",
          });
        }
      } catch {
        results.push({
          name: repo.full_name,
          ok: false,
          error: "Network error",
        });
      }
    }

    setImportResults(results);
    setImporting(false);
    setRowSelection({});
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <Link
          href="/repos"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-tertiary transition hover:text-text-primary"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
          Back to repositories
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Import repositories
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Import repositories from your connected GitHub or GitLab accounts.
        </p>
      </div>

      {/* Provider tabs */}
      <div className="mb-6 flex gap-2">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setActiveProvider(p.id);
              setRowSelection({});
              setSearch("");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeProvider === p.id
                ? "bg-accent text-white"
                : "border border-stroke-default text-text-secondary hover:border-stroke-hover hover:text-text-primary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Import results */}
      {importResults.length > 0 && (
        <div className="mb-6 space-y-2">
          {importResults.map((r) => (
            <div
              key={r.name}
              className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
                r.ok
                  ? "border-accent/20 bg-accent/5 text-accent"
                  : "border-danger/20 bg-danger/5 text-danger"
              }`}
            >
              <span>{r.name}</span>
              <span>{r.ok ? "Imported" : r.error}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
          {error.includes("Connect") && (
            <Link
              href="/settings/connections"
              className="ml-2 underline hover:opacity-80"
            >
              Go to Settings
            </Link>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stroke-default border-t-accent" />
          <span className="ml-3 text-sm text-text-tertiary">
            Loading repositories...
          </span>
        </div>
      )}

      {!loading && !error && repos.length > 0 && (
        <>
          <DataTable
            columns={columns}
            data={repos}
            pageSize={20}
            searchPlaceholder="Search repositories..."
            globalFilter={search}
            onGlobalFilterChange={setSearch}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            enableRowSelection
            getRowId={(row) => row.full_name}
            emptyMessage="No repositories match your search."
            toolbar={() =>
              selectedCount > 0 ? (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                        />
                      </svg>
                      Import {selectedCount}{" "}
                      {selectedCount === 1 ? "repo" : "repos"}
                    </>
                  )}
                </button>
              ) : null
            }
          />
        </>
      )}

      {!loading && !error && repos.length === 0 && !data[activeProvider] && (
        <p className="py-12 text-center text-sm text-text-tertiary">
          Connect your{" "}
          {activeProvider === "github" ? "GitHub" : "GitLab"} account in{" "}
          <Link
            href="/settings/connections"
            className="text-accent hover:underline"
          >
            Settings
          </Link>{" "}
          to import repositories.
        </p>
      )}
    </div>
  );
}
