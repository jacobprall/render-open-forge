"use client";

import React from "react";
import Link from "next/link";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface ListRowProps {
  href?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function ListRow({
  href,
  icon,
  title,
  subtitle,
  meta,
  trailing,
  className,
  onClick,
}: ListRowProps) {
  const content = (
    <>
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-text-secondary">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{title}</span>
          {meta && <div className="flex shrink-0 items-center gap-2">{meta}</div>}
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-text-secondary">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0 text-text-secondary">{trailing}</div>}
    </>
  );

  const sharedClassName = cn(
    "flex items-center gap-3 rounded-lg border border-stroke-subtle px-4 py-3 transition-colors hover:bg-surface-1",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={sharedClassName}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={cn(sharedClassName, "w-full text-left cursor-pointer")}>
        {content}
      </button>
    );
  }

  return <div className={sharedClassName}>{content}</div>;
}
