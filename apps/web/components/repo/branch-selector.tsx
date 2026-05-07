"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface BranchSelectorProps {
  branches: { name: string }[];
  currentBranch: string;
  owner: string;
  repo: string;
}

export function BranchSelector({
  branches,
  currentBranch,
  owner,
  repo,
}: BranchSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  function handleSelect(branchName: string) {
    setOpen(false);
    setSearch("");

    const basePath = `/${owner}/${repo}`;
    const treeMatch = pathname.match(
      /^\/[^/]+\/[^/]+\/tree\/[^/]+\/?(.*)$/,
    );
    const blobMatch = pathname.match(
      /^\/[^/]+\/[^/]+\/blob\/[^/]+\/?(.*)$/,
    );

    if (treeMatch) {
      const subPath = treeMatch[1];
      router.push(
        subPath
          ? `${basePath}/tree/${encodeURIComponent(branchName)}/${subPath}`
          : `${basePath}/tree/${encodeURIComponent(branchName)}`,
      );
    } else if (blobMatch) {
      const subPath = blobMatch[1];
      router.push(
        subPath
          ? `${basePath}/blob/${encodeURIComponent(branchName)}/${subPath}`
          : basePath,
      );
    } else if (pathname.includes("/commits/")) {
      router.push(`${basePath}/commits/${encodeURIComponent(branchName)}`);
    } else {
      router.push(basePath);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
      >
        <svg
          className="h-4 w-4 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-12.814a2.25 2.25 0 1 0 0-2.186m0 2.186a2.246 2.246 0 0 0-.283-1.093m.283 1.093c-.18.324-.283.696-.283 1.093s.103.77.283 1.093m0 9.435a2.25 2.25 0 1 0 0 2.186m0-2.186a2.246 2.246 0 0 0-.283-1.093"
          />
        </svg>
        <span>{currentBranch}</span>
        <svg
          className="h-3.5 w-3.5 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a branch…"
              autoFocus
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">
                No branches found
              </div>
            ) : (
              filtered.map((branch) => (
                <button
                  key={branch.name}
                  onClick={() => handleSelect(branch.name)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-zinc-800 ${
                    branch.name === currentBranch
                      ? "text-emerald-400"
                      : "text-zinc-300"
                  }`}
                >
                  {branch.name === currentBranch && (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                  )}
                  {branch.name !== currentBranch && (
                    <span className="inline-block w-3.5" />
                  )}
                  {branch.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
