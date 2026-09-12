import { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Make sure Prisma engine binaries are traced into the standalone bundle
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/**",
      "./node_modules/@prisma/client/**",
      "./prisma/**",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
