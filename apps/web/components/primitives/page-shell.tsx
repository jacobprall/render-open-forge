import React from "react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface PageShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
}

export function PageShell({
  title,
  description,
  actions,
  children,
  className,
  narrow = false,
}: PageShellProps) {
  void title;
  void description;
  return (
    <div className={cn("px-6 py-6", narrow ? "mx-auto max-w-4xl" : "", className)}>
      {actions && (
        <div className="mb-4 flex items-center justify-end gap-2">{actions}</div>
      )}
      {children}
    </div>
  );
}
