"use client";

import { useEffect } from "react";

export interface ThemeColors {
  accentColor: string | null;
  secondaryColor: string | null;
  tertiaryColor: string | null;
}

const COLOR_PRESETS: Record<string, { base: string; hover: string; bg: string; text: string }> = {
  purple:   { base: "#8a05ff",                 hover: "#9b52fb",                bg: "#2a0052",                        text: "#d1b8ff" },
  emerald:  { base: "oklch(0.696 0.17 162)",  hover: "oklch(0.637 0.16 162)",  bg: "oklch(0.696 0.17 162 / 0.1)",  text: "oklch(0.765 0.155 162)" },
  blue:     { base: "oklch(0.623 0.214 259)",  hover: "oklch(0.546 0.21 259)",  bg: "oklch(0.623 0.214 259 / 0.1)",  text: "oklch(0.707 0.165 254)" },
  violet:   { base: "oklch(0.606 0.25 292)",   hover: "oklch(0.541 0.24 292)",  bg: "oklch(0.606 0.25 292 / 0.1)",   text: "oklch(0.678 0.2 292)" },
  rose:     { base: "oklch(0.645 0.22 16)",    hover: "oklch(0.586 0.22 16)",   bg: "oklch(0.645 0.22 16 / 0.1)",    text: "oklch(0.712 0.194 13)" },
  amber:    { base: "oklch(0.768 0.165 84)",   hover: "oklch(0.666 0.16 84)",   bg: "oklch(0.768 0.165 84 / 0.1)",   text: "oklch(0.82 0.13 84)" },
  cyan:     { base: "oklch(0.715 0.143 215)",  hover: "oklch(0.609 0.14 215)",  bg: "oklch(0.715 0.143 215 / 0.1)",  text: "oklch(0.789 0.109 215)" },
  orange:   { base: "oklch(0.705 0.191 47)",   hover: "oklch(0.646 0.191 47)",  bg: "oklch(0.705 0.191 47 / 0.1)",   text: "oklch(0.792 0.152 47)" },
  pink:     { base: "oklch(0.656 0.241 354)",  hover: "oklch(0.592 0.24 354)",  bg: "oklch(0.656 0.241 354 / 0.1)",  text: "oklch(0.718 0.202 349)" },
  teal:     { base: "oklch(0.704 0.14 181)",   hover: "oklch(0.627 0.14 181)",  bg: "oklch(0.704 0.14 181 / 0.1)",   text: "oklch(0.777 0.108 181)" },
  indigo:   { base: "oklch(0.585 0.233 277)",  hover: "oklch(0.518 0.23 277)",  bg: "oklch(0.585 0.233 277 / 0.1)",  text: "oklch(0.673 0.182 276)" },
};

export const AVAILABLE_COLORS = Object.keys(COLOR_PRESETS);

function applyColorGroup(prefix: string, colorName: string | null, fallback: string) {
  const resolved = COLOR_PRESETS[colorName ?? ""] ?? COLOR_PRESETS[fallback];
  if (!resolved) return;
  const root = document.documentElement;
  root.style.setProperty(`--of-${prefix}`, resolved.base);
  root.style.setProperty(`--of-${prefix}-hover`, resolved.hover);
  root.style.setProperty(`--of-${prefix}-bg`, resolved.bg);
  root.style.setProperty(`--of-${prefix}-text`, resolved.text);
}

export function ThemeProvider({
  colors,
  children,
}: {
  colors: ThemeColors;
  children: React.ReactNode;
}) {
  useEffect(() => {
    applyColorGroup("accent", colors.accentColor, "purple");
    applyColorGroup("secondary", colors.secondaryColor, "purple");
    applyColorGroup("tertiary", colors.tertiaryColor, "purple");
  }, [colors.accentColor, colors.secondaryColor, colors.tertiaryColor]);

  return <>{children}</>;
}
