import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@prepdog/assessment",
    "@prepdog/content",
    "@prepdog/firebase",
  ],
};

export default nextConfig;
