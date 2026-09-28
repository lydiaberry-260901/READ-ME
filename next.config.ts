import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep server only database and job packages out of the browser bundle.
  serverExternalPackages: ["pg", "pg-boss", "@prisma/adapter-pg"],
  experimental: {
    serverActions: {
      // CSV imports send up to 5,000 rows at once.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
