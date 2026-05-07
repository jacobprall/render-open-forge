"use client";

import { useEffect, useState, useRef } from "react";
import type { Notification } from "@/lib/notifications";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchNotifications() {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        setNotifications(await res.json());
      }
    }
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

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
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
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
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
          <div className="border-b border-zinc-800 px-4 py-2">
            <span className="text-sm font-medium text-zinc-200">
              Notifications
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <a
                  key={n.id}
                  href={n.link || "#"}
                  className="block border-b border-zinc-800 px-4 py-3 transition-colors last:border-0 hover:bg-zinc-800/50"
                >
                  <p className="text-sm font-medium text-zinc-200">
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">{n.body}</p>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
