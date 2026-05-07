import React from "react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const STATUS_MAP = {
  running: { label: "Running", color: "bg-accent-bg text-accent-text border-accent/25", dot: "bg-accent animate-pulse" },
  completed: { label: "Completed", color: "bg-success/10 text-success border-success/25", dot: "bg-success" },
  failed: { label: "Failed", color: "bg-danger/10 text-danger border-danger/25", dot: "bg-danger" },
  archived: { label: "Archived", color: "bg-surface-2 text-text-tertiary border-stroke-subtle", dot: "bg-text-tertiary" },
  queued: { label: "Queued", color: "bg-warning/10 text-warning border-warning/25", dot: "bg-warning" },
  error: { label: "Error", color: "bg-danger/10 text-danger border-danger/25", dot: "bg-danger" },
  aborted: { label: "Aborted", color: "bg-surface-2 text-text-tertiary border-stroke-subtle", dot: "bg-text-tertiary" },
  open: { label: "Open", color: "bg-success/10 text-success border-success/25", dot: "bg-success" },
  merged: { label: "Merged", color: "bg-secondary-bg text-secondary-text border-secondary/25", dot: "bg-secondary" },
  closed: { label: "Closed", color: "bg-danger/10 text-danger border-danger/25", dot: "bg-danger" },
  success: { label: "Success", color: "bg-success/10 text-success border-success/25", dot: "bg-success" },
  failure: { label: "Failure", color: "bg-danger/10 text-danger border-danger/25", dot: "bg-danger" },
  pending: { label: "Pending", color: "bg-warning/10 text-warning border-warning/25", dot: "bg-warning animate-pulse" },
  active: { label: "Active", color: "bg-success/10 text-success border-success/25", dot: "bg-success" },
  paused: { label: "Paused", color: "bg-warning/10 text-warning border-warning/25", dot: "bg-warning" },
  public: { label: "Public", color: "bg-info/10 text-info border-info/25", dot: "bg-info" },
  private: { label: "Private", color: "bg-surface-2 text-text-tertiary border-stroke-subtle", dot: "bg-text-tertiary" },
} as const;

export type StatusKey = keyof typeof STATUS_MAP;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusKey | (string & {});
  label?: string;
  dot?: boolean;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, dot = true, className, ...props }, ref) => {
    const resolved = STATUS_MAP[status as StatusKey] ?? {
      label: status,
      color: "bg-surface-2 text-text-secondary border-stroke-subtle",
      dot: "bg-text-tertiary",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
          resolved.color,
          className,
        )}
        {...props}
      >
        {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", resolved.dot)} />}
        {label ?? resolved.label}
      </span>
    );
  },
);

StatusBadge.displayName = "StatusBadge";
