import type { NextConfig } from "next";

const isStaticFirebaseHostingBuild = process.env.STATIC_FIREBASE_HOSTING === "1";

const nextConfig: NextConfig = {
  output: isStaticFirebaseHostingBuild ? "export" : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.prepdog.org",
      },
    ],
  },
  transpilePackages: [
    "@prepdog/assessment",
    "@prepdog/content",
    "@prepdog/firebase",
  ],
};

export default nextConfig;
