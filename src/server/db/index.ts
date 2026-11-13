// Singleton Prisma pour Next.js (Prisma 7 + driver adapters)
// Le fournisseur actif est choisi au démarrage du process via DB_PROVIDER :
// - "sqlite"   (défaut) : @prisma/adapter-libsql, base prisma/shop.db
// - "postgres" : @prisma/adapter-pg, POSTGRES_DATABASE_URL
// Le type canonique du singleton est le client généré SQLite ; le client
// PostgreSQL généré depuis le même schéma est casté (API identique).

import "server-only";

import { PrismaClient as SqlitePrismaClient } from "@/generated/prisma/sqlite/client";
import { dbProvider } from "@/server/db/config";
import { createSqliteClient } from "@/server/db/client.sqlite";
import { createPostgresClient } from "@/server/db/client.postgres";

export type AppPrismaClient = SqlitePrismaClient;
export type TxClient = Parameters<Parameters<AppPrismaClient["$transaction"]>[0]>[0];
export type DbClient = AppPrismaClient | TxClient;

function createPrismaClient(): AppPrismaClient {
  if (dbProvider === "postgres") {
    const postgresClient = createPostgresClient();
    return postgresClient as unknown as AppPrismaClient;
  }
  return createSqliteClient();
}

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
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

export function resetPrismaClient(): AppPrismaClient {
  const newClient = createPrismaClient();
  globalForPrisma.prisma = newClient;
  return newClient;
}

export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
