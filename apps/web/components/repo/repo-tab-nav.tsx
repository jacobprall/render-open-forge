"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type RepoTabItem = {
  id: "code" | "sessions" | "commits" | "ci" | "settings";
  label: string;
  href: string;
};

function normalizePath(p: string) {
  return p.replace(/\/$/, "") || "/";
}

function isActive(pathname: string, tab: RepoTabItem, basePath: string) {
  const p = normalizePath(pathname);
  const base = normalizePath(basePath);

  switch (tab.id) {
    case "code":
      return (
        p === base ||
        p.startsWith(`${base}/edit/`) ||
        p.startsWith(`${base}/commit/`)
      );
    case "sessions":
      return p.startsWith(`${base}/sessions`);
    case "commits":
      return p.startsWith(`${base}/commits`);
    case "ci":
      return p.startsWith(`${base}/actions`);
    case "settings":
      return p.startsWith(`${base}/settings`);
    default:
      return false;
  }
}

export function RepoTabNav({ basePath, tabs }: { basePath: string; tabs: RepoTabItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="-mb-px flex min-w-0 gap-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab, basePath);
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-(--of-duration-instant) ${
              active
                ? "border-accent text-accent-text"
                : "border-transparent text-text-tertiary hover:border-stroke-subtle hover:text-text-primary"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
