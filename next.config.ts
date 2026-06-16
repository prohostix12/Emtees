import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@jitsi/react-sdk"],
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
