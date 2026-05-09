"use client";

import { useEffect } from "react";

export type ThemePreset = "default" | "terminal" | "typewriter" | "blueprint" | "warm-analog";

export const THEME_PRESETS: {
  id: ThemePreset;
  label: string;
  description: string;
  swatch: { bg: string; fg: string; accent: string };
}[] = [
  {
    id: "default",
    label: "Render",
    description: "Dark, minimal, Render purple",
    swatch: { bg: "#0d0d0d", fg: "#f0f0f0", accent: "#8a05ff" },
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Black, monospaced, cyber green",
    swatch: { bg: "#060606", fg: "#e0e0e0", accent: "#00ff41" },
  },
  {
    id: "typewriter",
    label: "Typewriter",
    description: "Warm paper, monospaced, gold ink",
    swatch: { bg: "#faf8f4", fg: "#1c1810", accent: "#a07020" },
  },
  {
    id: "blueprint",
    label: "Blueprint",
    description: "Blueprint paper, white lines, cyan",
    swatch: { bg: "#1a3050", fg: "#e8f0ff", accent: "#40d0ff" },
  },
  {
    id: "warm-analog",
    label: "Analog",
    description: "Warm cream, burnt orange",
    swatch: { bg: "#f6f2ec", fg: "#1c1610", accent: "#c85020" },
  },
];

export function ThemeProvider({
  theme = "default",
  children,
}: {
  theme?: ThemePreset;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "default") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  return <>{children}</>;
}
