import React from "react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const variantStyles = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  failure: "bg-red-500/15 text-red-400 border-red-500/25",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
} as const;

const dotStyles = {
  success: "bg-emerald-400",
  failure: "bg-red-400",
  pending: "bg-amber-400",
  info: "bg-blue-400",
  neutral: "bg-zinc-400",
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
