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
  preview?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function ToolLayout({
  icon,
  title,
  subtitle,
  status = "idle",
  defaultOpen = false,
  preview,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const statusIcon =
    status === "running" ? (
      <Loader2 className="size-3 text-text-tertiary animate-spin" />
    ) : status === "success" ? (
      <CheckCircle2 className="size-3 text-accent-text" />
    ) : status === "error" ? (
      <XCircle className="size-3 text-danger" />
    ) : null;

  return (
    <div
      className={cn(
        "border border-stroke-subtle bg-surface-1 text-xs overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-(--of-space-md) py-(--of-space-sm) w-full text-left hover:bg-surface-2 transition-colors duration-(--of-duration-instant)"
      >
        {open ? (
          <ChevronDown className="size-3 text-text-tertiary shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-text-tertiary shrink-0" />
        )}
        {icon && <span className="shrink-0 text-text-tertiary">{icon}</span>}
        <span className="font-medium text-text-primary truncate">{title}</span>
        {subtitle && (
          <span className="text-text-tertiary truncate font-normal ml-0.5">
            {subtitle}
          </span>
        )}
        {statusIcon && <span className="ml-auto shrink-0">{statusIcon}</span>}
      </button>
      {!open && preview && (
        <div className="border-t border-stroke-subtle bg-surface-0 px-(--of-space-md) py-(--of-space-xs) font-mono text-text-tertiary overflow-hidden">
          {preview}
        </div>
      )}
      <div
        className="grid transition-[grid-template-rows] duration-(--of-duration-fast)"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {children && (
            <div className="border-t border-stroke-subtle bg-surface-0 px-(--of-space-md) py-(--of-space-sm) font-mono overflow-auto max-h-72">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
