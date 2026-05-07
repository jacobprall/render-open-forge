"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "complete">("idle");
  const prev = useRef(pathname);

  useEffect(() => {
    if (pathname === prev.current) return;
    prev.current = pathname;

    setState("loading");
    const timer = setTimeout(() => {
      setState("complete");
      const fade = setTimeout(() => setState("idle"), 300);
      return () => clearTimeout(fade);
    }, 500);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (state === "idle") return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-9999 h-0.5"
      role="progressbar"
    >
      <div
        className={`h-full bg-accent shadow-[0_0_8px_rgba(16,185,129,0.6)] ${
          state === "loading" ? "animate-route-progress" : "animate-route-complete"
        }`}
      />
    </div>
  );
}
