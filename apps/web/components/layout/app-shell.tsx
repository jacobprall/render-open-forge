"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import type { BreadcrumbItem } from "./breadcrumbs";

interface AppShellProps {
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
  user: {
    username: string;
    avatarUrl: string;
  };
  children: React.ReactNode;
}

export function AppShell({
  breadcrumbs,
  actions,
  user,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar
        user={user}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar breadcrumbs={breadcrumbs} onMenuClick={() => setMobileOpen(true)}>
          {actions}
        </TopBar>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
