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
    description: "Phosphor green, monospaced",
    swatch: { bg: "#0a0a0a", fg: "#b8ffb8", accent: "#00ff41" },
  },
  {
    id: "typewriter",
    label: "Typewriter",
    description: "Warm sepia, serif type",
    swatch: { bg: "#1a1612", fg: "#ede5d8", accent: "#d4a04a" },
  },
  {
    id: "blueprint",
    label: "Blueprint",
    description: "Deep navy, cyan lines",
    swatch: { bg: "#0a0e1a", fg: "#d8e8ff", accent: "#00bfff" },
  },
  {
    id: "warm-analog",
    label: "Analog",
    description: "Dark clay, burnt orange",
    swatch: { bg: "#141010", fg: "#f0e0d0", accent: "#e06020" },
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
