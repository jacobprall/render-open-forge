"use client";

import React, { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn,
  type Table,
} from "@tanstack/react-table";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  pageSize?: number;
  searchPlaceholder?: string;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  enableRowSelection?: boolean | ((row: { original: TData }) => boolean);
  getRowId?: (row: TData) => string;
  toolbar?: (table: Table<TData>) => React.ReactNode;
  emptyMessage?: string;
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 20,
  searchPlaceholder = "Search...",
  globalFilter: controlledFilter,
  onGlobalFilterChange,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  enableRowSelection,
  getRowId,
  toolbar,
  emptyMessage = "No results found.",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalFilter, setInternalFilter] = useState("");

  const isFilterControlled = controlledFilter !== undefined;
  const globalFilter = isFilterControlled ? controlledFilter : internalFilter;
  const setGlobalFilter = isFilterControlled
    ? onGlobalFilterChange!
    : setInternalFilter;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      ...(controlledSelection !== undefined && {
        rowSelection: controlledSelection,
      }),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    ...(onRowSelectionChange && {
      onRowSelectionChange,
    }),
    enableRowSelection: enableRowSelection ?? false,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      {/* Search + toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              table.setPageIndex(0);
            }}
            className="w-full h-9 rounded-md border border-stroke-default bg-surface-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
        {toolbar?.(table)}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-stroke-default overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-stroke-default bg-surface-1"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-4 py-2.5 text-left text-xs font-medium text-text-secondary uppercase tracking-wider",
                      header.column.getCanSort() &&
                        "cursor-pointer select-none hover:text-text-primary transition-colors"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1.5">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {header.column.getIsSorted() === "asc" && (
                        <ChevronUp className="h-3.5 w-3.5" />
                      )}
                      {header.column.getIsSorted() === "desc" && (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-text-tertiary"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-stroke-default last:border-b-0 transition-colors",
                    row.getIsSelected()
                      ? "bg-accent/5"
                      : "hover:bg-surface-1"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-tertiary">
            {totalRows} {totalRows === 1 ? "result" : "results"}
          </span>
          <div className="flex items-center gap-1.5">
            <PaginationButton
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </PaginationButton>
            <PaginationButton
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </PaginationButton>
            <span className="px-3 text-text-secondary tabular-nums">
              {pageIndex + 1} / {pageCount}
            </span>
            <PaginationButton
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </PaginationButton>
            <PaginationButton
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-stroke-default text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none"
      {...props}
    >
      {children}
    </button>
  );
}

function ChevronUp({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function ChevronsLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.75 19.5-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
    </svg>
  );
}

function ChevronsRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
    </svg>
  );
}
