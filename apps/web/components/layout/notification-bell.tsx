"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import type { Notification } from "@/lib/notifications";

async function notificationsFetcher(url: string): Promise<Notification[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const json: unknown = await res.json();
  if (Array.isArray(json)) return json as Notification[];
  if (json && typeof json === "object" && "notifications" in json) {
    const n = (json as { notifications: unknown }).notifications;
    return Array.isArray(n) ? (n as Notification[]) : [];
  }
  if (json && typeof json === "object" && "data" in json) {
    const d = (json as { data: unknown }).data;
    return Array.isArray(d) ? (d as Notification[]) : [];
  }
  return [];
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: notifications = [] } = useSWR("/api/notifications", notificationsFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 text-text-tertiary transition-colors duration-(--of-duration-instant) hover:bg-surface-2 hover:text-text-primary"
        aria-label="Notifications"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 bottom-full z-50 mb-2 w-80 border border-stroke-subtle bg-surface-1 shadow-xl">
          <div className="border-b border-stroke-subtle px-4 py-2">
            <span className="text-sm font-medium text-text-primary">Notifications</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-tertiary">No notifications</div>
            ) : (
              notifications.map((n) => (
                <a
                  key={n.id}
                  href={n.link || "#"}
                  className="block border-b border-stroke-subtle px-4 py-3 transition-colors duration-(--of-duration-instant) last:border-0 hover:bg-surface-2/50"
                >
                  <p className="text-sm font-medium text-text-primary">{n.title}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">{n.body}</p>
                </a>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
