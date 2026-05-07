import React from "react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const variantStyles = {
  success: "bg-success/15 text-success border-success/25",
  failure: "bg-danger/15 text-danger border-danger/25",
  pending: "bg-warning/15 text-warning border-warning/25",
  info: "bg-info/15 text-info border-info/25",
  neutral: "bg-zinc-500/15 text-text-secondary border-stroke-subtle",
} as const;

const dotStyles = {
  success: "bg-success",
  failure: "bg-danger",
  pending: "bg-warning",
  info: "bg-info",
  neutral: "bg-text-tertiary",
} as const;

type BadgeVariant = keyof typeof variantStyles;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", dot = false, className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn("h-1.5 w-1.5 rounded-full", dotStyles[variant])}
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
