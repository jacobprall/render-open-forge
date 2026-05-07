import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@render-open-forge/db",
    "@render-open-forge/shared",
  ],
};

export default nextConfig;
