import "dotenv/config";
import { defineConfig } from "prisma/config";

const provider = (process.env.DB_PROVIDER ?? "sqlite").trim().toLowerCase();

const config =
  provider === "postgres"
    ? {
        schema: "prisma/.generated/postgres/schema.prisma",
        migrations: {
          path: "prisma/migrations-postgres",
        },
        datasource: {
          url: process.env.POSTGRES_DATABASE_URL ?? "",
        },
      }
    : {
        schema: "prisma/schema.prisma",
        migrations: {
          path: "prisma/migrations",
        },
        datasource: {
          url: process.env.DATABASE_URL ?? "file:./prisma/shop.db",
        },
      };

export default defineConfig(config);
