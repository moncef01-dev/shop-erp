import { dbProvider } from "@/server/db/config";
import { supportsFileBackup } from "@/server/db/capabilities";
import {
  createSqliteBackup,
  restoreSqliteBackup,
  listSqliteBackups,
  verifySqliteBackup,
  deleteSqliteBackup,
  type BackupFileInfo,
} from "@/server/services/backup/sqlite.backup";

export type { BackupFileInfo };

export { getDatabasePath, getBackupDir, verifyBackupIntegrity } from "@/server/services/backup/sqlite.backup";

const PG_UNAVAILABLE = "La sauvegarde fichier n'est pas disponible pour PostgreSQL (DB_PROVIDER=postgres). Utilisez un dump externe (ex. pg_dump).";

export async function createBackup(): Promise<{
  success: boolean;
  backup?: BackupFileInfo;
  error?: string;
}> {
  if (!supportsFileBackup()) {
    return { success: false, error: PG_UNAVAILABLE };
  }
  return createSqliteBackup();
}

export async function restoreBackup(
  filename: string,
  confirmBackupName: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!supportsFileBackup()) {
    return { success: false, error: PG_UNAVAILABLE };
  }
  return restoreSqliteBackup(filename, confirmBackupName);
}

export async function listBackups(): Promise<{
  success: boolean;
  backups: BackupFileInfo[];
  latestVerified?: string;
  error?: string;
}> {
  if (!supportsFileBackup()) {
    return { success: false, backups: [], error: PG_UNAVAILABLE };
  }
  return listSqliteBackups();
}

export async function verifyBackup(
  filename: string
): Promise<{ success: boolean; verified: boolean; message: string; error?: string }> {
  if (!supportsFileBackup()) {
    return { success: false, verified: false, message: PG_UNAVAILABLE, error: PG_UNAVAILABLE };
  }
  return verifySqliteBackup(filename);
}

export async function deleteBackup(filename: string): Promise<{ success: boolean; error?: string }> {
  if (!supportsFileBackup()) {
    return { success: false, error: PG_UNAVAILABLE };
  }
  return deleteSqliteBackup(filename);
}

export function isBackupSupported(): boolean {
  return dbProvider === "sqlite";
}
