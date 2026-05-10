"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DataTable } from "@/components/primitives/data-table";
import { StatusBadge } from "@/components/primitives";
import { ReviewButton } from "./review-button";
import { relativeTime } from "@/lib/utils";

export type PrRow = {
  id: string;
  title: string;
  repoPath: string | null;
  branch: string | null;
  baseBranch: string | null;
  prNumber: number | null;
  prStatus: string | null;
  status: string;
  linesAdded: number | null;
  linesRemoved: number | null;
  updatedAt: string;
  createdAt: string;
};

const columnHelper = createColumnHelper<PrRow>();

const columns = [
  columnHelper.accessor("title", {
    header: "Title",
    cell: ({ row }) => {
      const r = row.original;
      const prUrl = `/${r.repoPath ?? ""}/pulls/${r.prNumber}`;
      return (
        <div className="min-w-0">
          <Link
            href={prUrl}
            className="font-semibold text-text-primary hover:text-accent-text transition truncate block"
          >
            {r.title}
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
            <Link
              href={`/${r.repoPath ?? ""}`}
              className="hover:text-text-primary transition"
            >
              {r.repoPath ?? "scratch"}
            </Link>
            <span>#{r.prNumber}</span>
          </div>
        </div>
      );
    },
  }),
  columnHelper.accessor("prStatus", {
    header: "Status",
    cell: ({ getValue }) => (
      <StatusBadge status={getValue() ?? "open"} className="shrink-0" />
    ),
  }),
  columnHelper.display({
    id: "branches",
    header: "Branch",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
          {r.branch}
          <ArrowRight className="h-3 w-3 text-text-tertiary" />
          {r.baseBranch}
        </span>
      );
    },
    enableSorting: false,
  }),
  columnHelper.display({
    id: "diff",
    header: "Changes",
    cell: ({ row }) => {
      const r = row.original;
      if (!r.linesAdded && !r.linesRemoved) return null;
      return (
        <span className="font-mono text-xs tabular-nums whitespace-nowrap">
          <span className="text-success">+{r.linesAdded ?? 0}</span>{" "}
          <span className="text-danger">-{r.linesRemoved ?? 0}</span>
        </span>
      );
    },
    enableSorting: false,
  }),
  columnHelper.accessor("updatedAt", {
    header: "Updated",
    cell: ({ getValue }) => (
      <span className="text-xs text-text-tertiary whitespace-nowrap" suppressHydrationWarning>
        {relativeTime(new Date(getValue()))}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex items-center gap-2 justify-end">
          <Link
            href={`/sessions/${r.id}`}
            className="rounded px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary"
          >
            Session
          </Link>
          {(r.prStatus ?? "open") === "open" && (
            <ReviewButton sessionId={r.id} />
          )}
        </div>
      );
    },
    enableSorting: false,
  }),
];

export function PrTable({ data }: { data: PrRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pageSize={20}
      searchPlaceholder="Search pull requests..."
      emptyMessage="No pull requests found."
      getRowId={(row) => row.id}
    />
  );
}
