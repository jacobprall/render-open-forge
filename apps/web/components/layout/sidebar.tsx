"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Folder,
  MessageCircle,
  GitPullRequest,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Code,
} from "@/components/icons";
import { signOut } from "next-auth/react";
import { useInboxCount } from "./use-inbox-count";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badgeKey?: string;
}

const navItems: NavItem[] = [
  { label: "Repositories", href: "/repos", icon: Folder },
  { label: "Sessions", href: "/sessions", icon: MessageCircle },
  { label: "Pull Requests", href: "/pulls", icon: GitPullRequest, badgeKey: "inbox" },
  { label: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  user: {
    username: string;
    avatarUrl: string;
  };
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ user, mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { count: inboxCount } = useInboxCount();

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleSignOut() {
    await signOut({ callbackUrl: "/" });
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "w-16" : "w-60"}`}
      >
        {/* Logo */}
        <div
          className={`flex h-12 items-center border-b border-zinc-800 ${
            collapsed ? "justify-center" : "gap-2 px-4"
          }`}
        >
          <Code className="h-5 w-5 shrink-0 text-emerald-500" />
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight">
              OpenForge
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-2 py-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const badge = item.badgeKey === "inbox" ? inboxCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {badge > 0 && !collapsed && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[11px] font-semibold tabular-nums text-emerald-400">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {badge > 0 && collapsed && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
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
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.username}
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full bg-zinc-700"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-zinc-300">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
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

        {/* Collapse toggle (desktop only) */}
        <div className="hidden border-t border-zinc-800 p-2 md:block">
          <button
            onClick={toggleCollapsed}
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
    </>
  );
}
