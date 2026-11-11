import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient as SqlitePrismaClient } from "@/generated/prisma/sqlite/client";
import { getSqliteDatabaseUrl } from "@/server/db/config";

export function createSqliteClient(): SqlitePrismaClient {
  const adapter = new PrismaLibSql({ url: getSqliteDatabaseUrl() });
  return new SqlitePrismaClient({ adapter });
}
