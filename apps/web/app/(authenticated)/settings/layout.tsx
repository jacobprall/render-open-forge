"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Sparkles, Key, Link2, ArrowLeftRight, Wrench } from "lucide-react";

const navItems = [
  { label: "Profile & Preferences", href: "/settings", exact: true, icon: User },
  { label: "Models", href: "/settings/models", exact: false, icon: Sparkles },
  { label: "API Keys", href: "/settings/api-keys", exact: false, icon: Key },
  { label: "Connections", href: "/settings/connections", exact: false, icon: Link2 },
  { label: "Mirrors", href: "/settings/mirrors", exact: false, icon: ArrowLeftRight },
  { label: "Skills", href: "/settings/skills", exact: false, icon: Wrench },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-8 text-2xl font-bold tracking-tight">Settings</h1>
      <div className="flex flex-col gap-8 lg:flex-row">
        <nav className="w-full shrink-0 lg:w-56">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-surface-2/70 text-text-primary"
                        : "text-text-secondary hover:bg-surface-1 hover:text-text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
