import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

for (const envFile of [".env.local", ".env"]) {
  try {
    const content = readFileSync(join(__dirname, envFile), "utf-8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i);
      const v = t.slice(i + 1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}

const forgejoHost = (() => {
  const raw = process.env.FORGEJO_EXTERNAL_URL || process.env.FORGEJO_INTERNAL_URL || "";
  try { return new URL(raw).hostname; } catch { return "localhost"; }
})();

const nextConfig: NextConfig = {
  transpilePackages: [
    "@openforge/db",
    "@openforge/shared",
    "@openforge/skills",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: forgejoHost,
      },
      {
        protocol: "https",
        hostname: forgejoHost,
      },
    ],
  },
};

export default nextConfig;
