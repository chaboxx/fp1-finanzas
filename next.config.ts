import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FINANZAS_REVIEW === "1" ? ".next-review" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
