"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import type { BreadcrumbItem } from "./breadcrumbs";

const labelOverrides: Record<string, string> = {
  repos: "Repositories",
  sessions: "Sessions",
  settings: "Settings",
  connections: "Connections",
  models: "Models",
  new: "New",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  return segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const decoded = decodeURIComponent(seg);
    const label = labelOverrides[seg] ?? (UUID_RE.test(decoded) ? decoded.slice(0, 8) + "…" : decoded);
    const isLast = i === segments.length - 1;
    return { label, href: isLast ? undefined : href };
  });
}

interface DynamicShellProps {
  user: { username: string; avatarUrl: string };
  children: React.ReactNode;
}

export function DynamicShell({ user, children }: DynamicShellProps) {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);

  return (
    <AppShell breadcrumbs={breadcrumbs} user={user}>
      {children}
    </AppShell>
  );
}
