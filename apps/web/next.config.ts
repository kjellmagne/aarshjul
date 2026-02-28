import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@aarshjul/wheel-core"]
};

export default nextConfig;
