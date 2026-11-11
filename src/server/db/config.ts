import path from "path";

export type DbProvider = "sqlite" | "postgres";

function resolveDbProvider(): DbProvider {
  const raw = (process.env.DB_PROVIDER ?? "sqlite").trim().toLowerCase();
  if (raw === "sqlite" || raw === "postgres") {
    return raw;
  }
  throw new Error(
    `DB_PROVIDER invalide : "${raw}". Valeurs supportées : "sqlite", "postgres".`
  );
}

export const dbProvider: DbProvider = resolveDbProvider();

/**
 * URL de connexion SQLite (résolue en chemin absolu si nécessaire).
 */
export function getSqliteDatabaseUrl(): string {
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

/**
 * Chaîne de connexion PostgreSQL. Requise quand DB_PROVIDER=postgres.
 */
export function getPostgresConnectionString(): string {
  const url = process.env.POSTGRES_DATABASE_URL;
  if (!url || !url.trim()) {
    throw new Error(
      "POSTGRES_DATABASE_URL est requis lorsque DB_PROVIDER=postgres. " +
        "Exemple : postgresql://user:password@localhost:5432/shop"
    );
  }
  return url.trim();
}
