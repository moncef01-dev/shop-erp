import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les adaptateurs driver Prisma doivent rester externalisés du bundle
  // serveur (dépendances natives / modules Node non bundlables).
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
    "@prisma/adapter-pg",
    "pg",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
