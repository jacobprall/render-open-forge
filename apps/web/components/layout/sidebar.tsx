"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  MessageCircle,
  GitPullRequest,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Code,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useInboxCount } from "./use-inbox-count";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: string;
}

const navItems: NavItem[] = [
  { label: "Repositories", href: "/repos", icon: FolderOpen },
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
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-stroke-subtle bg-surface-1 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "w-16" : "w-60"}`}
      >
        {/* Logo */}
        <div
          className={`flex h-12 items-center border-b border-stroke-subtle ${
            collapsed ? "justify-center" : "gap-2 px-4"
          }`}
        >
          <Code className="h-5 w-5 shrink-0 text-accent" />
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
                    ? "bg-surface-2 text-accent-text"
                    : "text-text-secondary hover:bg-surface-1 hover:text-text-primary"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {badge > 0 && !collapsed && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-bg px-1.5 text-[11px] font-semibold tabular-nums text-accent-text">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {badge > 0 && collapsed && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User menu */}
        <div className="border-t border-stroke-subtle p-2">
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
                className="h-7 w-7 shrink-0 rounded-full bg-surface-3"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-text-secondary">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <span className="flex-1 truncate text-sm text-text-secondary">
                {user.username}
              </span>
            )}
            {!collapsed && (
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="mt-1 flex w-full items-center justify-center rounded-md p-2 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden border-t border-stroke-subtle p-2 md:block">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center rounded-md p-2 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-secondary"
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
