"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolStatus = "running" | "success" | "error" | "idle";

interface Props {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  status?: ToolStatus;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function ToolLayout({
  icon,
  title,
  subtitle,
  status = "idle",
  defaultOpen = false,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const statusIcon =
    status === "running" ? (
      <Loader2 className="size-3 text-zinc-400 animate-spin" />
    ) : status === "success" ? (
      <CheckCircle2 className="size-3 text-emerald-500" />
    ) : status === "error" ? (
      <XCircle className="size-3 text-red-400" />
    ) : null;

  return (
    <div
      className={cn(
        "rounded-md border border-zinc-800 bg-zinc-900/50 text-xs overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-zinc-800/60 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-3 text-zinc-400 shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-zinc-400 shrink-0" />
        )}
        {icon && <span className="shrink-0 text-zinc-400">{icon}</span>}
        <span className="font-medium text-zinc-100 truncate">{title}</span>
        {subtitle && (
          <span className="text-zinc-400 truncate font-normal ml-0.5">
            {subtitle}
          </span>
        )}
        {statusIcon && <span className="ml-auto shrink-0">{statusIcon}</span>}
      </button>
      {open && children && (
        <div className="border-t border-zinc-800 bg-zinc-950/50 px-3 py-2 font-mono overflow-auto max-h-72">
          {children}
        </div>
      )}
    </div>
  );
}
