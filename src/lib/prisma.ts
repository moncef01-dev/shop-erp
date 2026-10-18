// Prisma client singleton for Next.js (Prisma 7 + libsql adapter)
// The SQLite database is stored at: prisma/shop.db
// No native build tools required — uses pure-JS @libsql/client

import path from "path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl && envUrl.trim()) {
    if (envUrl.startsWith("file:")) {
      const filePath = envUrl.slice(5);
      if (!path.isAbsolute(filePath)) {
        return `file:${path.resolve(process.cwd(), filePath)}`;
      }
      return envUrl;
    }
    return envUrl;
  }
  const dbPath = path.resolve(process.cwd(), "prisma", "shop.db");
  return `file:${dbPath}`;
}

function createPrismaClient() {
  const adapter = new PrismaLibSql({ url: getDatabaseUrl() });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  isRestoringDatabase: boolean | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function isDatabaseRestoring(): boolean {
  return Boolean(globalForPrisma.isRestoringDatabase);
}

export function setDatabaseRestoring(value: boolean): void {
  globalForPrisma.isRestoringDatabase = value;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (globalForPrisma.prisma) {
    try {
      await globalForPrisma.prisma.$disconnect();
    } catch (err) {
      console.warn("Avertissement déconnexion Prisma:", err);
    }
    globalForPrisma.prisma = undefined;
  }
}

export function resetPrismaClient(): PrismaClient {
  const newClient = createPrismaClient();
  globalForPrisma.prisma = newClient;
  return newClient;
}
