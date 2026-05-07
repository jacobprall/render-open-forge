"use client";

import React, { useState } from "react";
import Image from "next/image";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

const sizePx = { sm: 24, md: 32, lg: 40 } as const;

const sizeStyles = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
} as const;

type AvatarSize = keyof typeof sizeStyles;

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: AvatarSize;
}

function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, fallback, size = "md", className, ...props }, ref) => {
    const [imgError, setImgError] = useState(false);
    const showImage = src && !imgError;
    const initials = fallback
      ? getInitials(fallback)
      : alt
        ? getInitials(alt)
        : "?";

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full bg-zinc-700 text-zinc-200 font-medium shrink-0 overflow-hidden",
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {showImage ? (
          <Image
            src={src}
            alt={alt ?? ""}
            width={sizePx[size]}
            height={sizePx[size]}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            unoptimized={src.startsWith("data:")}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";
