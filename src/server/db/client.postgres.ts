import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as PostgresPrismaClient } from "@/generated/prisma/postgres/client";
import { getPostgresConnectionString } from "@/server/db/config";

export function createPostgresClient(): PostgresPrismaClient {
  const connectionString = getPostgresConnectionString();
  const adapter = new PrismaPg({ connectionString });
  return new PostgresPrismaClient({ adapter });
}
