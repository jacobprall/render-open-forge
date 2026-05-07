"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Folder,
  MessageCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Code,
} from "@/components/icons";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const navItems: NavItem[] = [
  { label: "Repositories", href: "/repos", icon: Folder },
  { label: "Sessions", href: "/sessions", icon: MessageCircle },
  { label: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  user: {
    username: string;
    avatarUrl: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <aside
      className={`flex h-screen flex-col border-r border-zinc-800 bg-zinc-900 transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex h-12 items-center gap-2 border-b border-zinc-800 px-4">
        <Code className="h-5 w-5 shrink-0 text-emerald-500" />
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight">
            render-open-forge
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-zinc-800 text-emerald-400"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="border-t border-zinc-800 p-2">
        <div
          className={`flex items-center gap-3 rounded-md px-3 py-2 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="h-7 w-7 shrink-0 rounded-full bg-zinc-700"
          />
          {!collapsed && (
            <span className="flex-1 truncate text-sm text-zinc-300">
              {user.username}
            </span>
          )}
          {!collapsed && (
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="mt-1 flex w-full items-center justify-center rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-zinc-800 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
