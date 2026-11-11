import { dbProvider, type DbProvider } from "@/server/db/config";

/**
 * Capacités du fournisseur de base de données actif.
 * Isolé ici pour que le reste du code reste 100% agnostique du moteur.
 */

export function supportsFileBackup(): boolean {
  return dbProvider === "sqlite";
}

export function caseInsensitiveSearch(): boolean {
  return dbProvider === "postgres";
}

export function providerLabel(): string {
  const labels: Record<DbProvider, string> = {
    sqlite: "SQLite (LibSQL)",
    postgres: "PostgreSQL",
  };
  return labels[dbProvider];
}
