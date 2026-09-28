import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep server only database and job packages out of the browser bundle.
  serverExternalPackages: ["pg", "pg-boss", "@prisma/adapter-pg"],
};

export default nextConfig;
