"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { DataTable } from "@/components/primitives/data-table";
import { StatusBadge } from "@/components/primitives";

export type RepoRow = {
  id: string | number;
  fullName: string;
  name: string;
  description: string;
  isPrivate: boolean;
  defaultBranch: string;
};

const columnHelper = createColumnHelper<RepoRow>();

const columns = [
  columnHelper.accessor("fullName", {
    header: "Repository",
    cell: ({ getValue }) => (
      <Link
        href={`/${getValue()}`}
        className="font-semibold text-text-primary hover:text-accent-text transition truncate block"
      >
        {getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: ({ getValue }) => {
      const desc = getValue();
      if (!desc)
        return <span className="text-text-tertiary">&mdash;</span>;
      return (
        <span className="text-sm text-text-secondary line-clamp-1">
          {desc}
        </span>
      );
    },
    enableSorting: false,
  }),
  columnHelper.accessor("isPrivate", {
    header: "Visibility",
    cell: ({ getValue }) => (
      <StatusBadge status={getValue() ? "private" : "public"} />
    ),
  }),
  columnHelper.accessor("defaultBranch", {
    header: "Default Branch",
    cell: ({ getValue }) => (
      <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
        <GitBranch className="h-3 w-3" />
        {getValue()}
      </span>
    ),
  }),
];

export function RepoTable({ data }: { data: RepoRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pageSize={20}
      searchPlaceholder="Search repositories..."
      emptyMessage="No matching repositories found."
      getRowId={(row) => String(row.id)}
    />
  );
}
