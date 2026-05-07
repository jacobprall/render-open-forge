import React from "react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "search";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ variant = "default", className, type, ...props }, ref) => {
    return (
      <div className="relative">
        {variant === "search" && (
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        )}
        <input
          ref={ref}
          type={type ?? (variant === "search" ? "search" : "text")}
          className={cn(
            "w-full rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            variant === "search" ? "h-9 pl-9 pr-3 text-sm" : "h-9 px-3 text-sm",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";
