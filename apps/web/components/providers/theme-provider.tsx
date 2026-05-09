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
    description: "Dark, serif type, warm gold",
    swatch: { bg: "#100f0d", fg: "#e8e2da", accent: "#c89030" },
  },
  {
    id: "blueprint",
    label: "Blueprint",
    description: "Dark navy, cyan accents",
    swatch: { bg: "#08090e", fg: "#dce2f0", accent: "#00b8ff" },
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
