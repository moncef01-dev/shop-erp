"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import {
  prisma,
  resetPrismaClient,
  disconnectPrismaClient,
  isDatabaseRestoring,
  setDatabaseRestoring,
} from "@/lib/prisma";
import { createClient } from "@libsql/client";

export interface ShopSettingsData {
  id: number;
  shopName: string;
  activity: string | null;
  legalForm?: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  nifRc: string | null;
  nis?: string | null;
  documentFooter: string | null;
  currency: string;
  defaultLocationId: number | null;
  logoUrl: string | null;
  backupRetentionCount: number;
  updatedAt?: Date | string;
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  formattedSize: string;
  createdAt: string;
  isVerified: boolean;
  verificationMessage?: string;
  isPreRestore?: boolean;
}

export interface SystemInfo {
  databasePath: string;
  databaseSizeBytes: number;
  formattedDatabaseSize: string;
  backupCount: number;
  verifiedBackupCount: number;
  latestVerifiedBackupName?: string;
  latestVerifiedBackupTime?: string;
  walMode: boolean;
  activeClientStatus: string;
}

const DEFAULT_SETTINGS: Omit<ShopSettingsData, "id"> = {
  shopName: "Shop ERP Mobilier",
  activity: "Magasin d'Ameublement & Décoration d'Intérieur",
  legalForm: "SARL / EURL",
  address: "Zone Commerciale & Exposition — Alger, Algérie",
  phone: "+213 (0) 550 12 34 56 / +213 (0) 23 45 67 89",
  email: "contact@shoperp-mobilier.dz",
  nifRc: "002416000000000",
  nis: null,
  documentFooter:
    "Merci pour votre confiance. Les marchandises vendues sont garanties 12 mois. Service après-vente disponible 6j/7.",
  currency: "DA",
  defaultLocationId: null,
  logoUrl: null,
  backupRetentionCount: 30,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Ko";
  const k = 1024;
  const sizes = ["Octets", "Ko", "Mo", "Go"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getDatabasePath(): string {
  return path.resolve(process.cwd(), "prisma", "shop.db");
}

function getBackupDir(): string {
  const dir = path.resolve(process.cwd(), "prisma", "backups");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Validates that a filename does not contain path traversal characters
 * and resolves strictly inside the allowed backup directory.
 */
function resolveSafeBackupPath(filename: string): { safePath: string; cleanName: string } {
  const trimmed = filename.trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    throw new Error("Nom de fichier de sauvegarde non valide ou tentative d'accès non autorisé.");
  }
  const cleanName = path.basename(trimmed);
  const backupDir = getBackupDir();
  const safePath = path.resolve(backupDir, cleanName);
  if (!safePath.startsWith(backupDir)) {
    throw new Error("Accès interdit : le chemin de sauvegarde sort du répertoire autorisé.");
  }
  return { safePath, cleanName };
}

// ─── 1. PARAMÈTRES DU MAGASIN ────────────────────────────────────────────────

export async function getShopSettings(): Promise<ShopSettingsData> {
  try {
    let settings = await prisma.shopSettings.findUnique({
      where: { id: 1 },
    });

    if (!settings) {
      settings = await prisma.shopSettings.create({
        data: {
          id: 1,
          ...DEFAULT_SETTINGS,
        },
      });
    }

    return {
      id: settings.id,
      shopName: settings.shopName || DEFAULT_SETTINGS.shopName,
      activity: settings.activity ?? DEFAULT_SETTINGS.activity,
      legalForm: settings.legalForm ?? DEFAULT_SETTINGS.legalForm,
      address: settings.address ?? DEFAULT_SETTINGS.address,
      phone: settings.phone ?? DEFAULT_SETTINGS.phone,
      email: settings.email ?? DEFAULT_SETTINGS.email,
      nifRc: settings.nifRc ?? DEFAULT_SETTINGS.nifRc,
      nis: settings.nis ?? null,
      documentFooter: settings.documentFooter ?? DEFAULT_SETTINGS.documentFooter,
      currency: settings.currency || "DA",
      defaultLocationId: settings.defaultLocationId,
      logoUrl: settings.logoUrl,
      backupRetentionCount: settings.backupRetentionCount ?? 30,
      updatedAt: settings.updatedAt,
    };
  } catch (error) {
    console.error("Erreur lors de la lecture des paramètres:", error);
    return { id: 1, ...DEFAULT_SETTINGS };
  }
}

export async function updateShopSettingsAction(
  data: Partial<ShopSettingsData>
): Promise<{ success: boolean; settings?: ShopSettingsData; error?: string }> {
  try {
    const shopName = data.shopName?.trim();
    if (!shopName || shopName.length < 2) {
      return { success: false, error: "Le nom du magasin est obligatoire (au moins 2 caractères)." };
    }

    let retentionCount = Number(data.backupRetentionCount);
    if (isNaN(retentionCount) || retentionCount < 1 || retentionCount > 365) {
      retentionCount = 30;
    }

    const updated = await prisma.shopSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        shopName,
        activity: data.activity?.trim() || null,
        legalForm: data.legalForm?.trim() || null,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        nifRc: data.nifRc?.trim() || null,
        nis: data.nis?.trim() || null,
        documentFooter: data.documentFooter?.trim() || null,
        currency: data.currency?.trim() || "DA",
        defaultLocationId: data.defaultLocationId ? Number(data.defaultLocationId) : null,
        backupRetentionCount: retentionCount,
      },
      update: {
        shopName,
        activity: data.activity?.trim() || null,
        legalForm: data.legalForm?.trim() || null,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        nifRc: data.nifRc?.trim() || null,
        nis: data.nis?.trim() || null,
        documentFooter: data.documentFooter?.trim() || null,
        currency: data.currency?.trim() || "DA",
        defaultLocationId: data.defaultLocationId ? Number(data.defaultLocationId) : null,
        backupRetentionCount: retentionCount,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/sales");
    revalidatePath("/purchases");
    revalidatePath("/cash");

    return {
      success: true,
      settings: {
        id: updated.id,
        shopName: updated.shopName,
        activity: updated.activity,
        legalForm: updated.legalForm,
        address: updated.address,
        phone: updated.phone,
        email: updated.email,
        nifRc: updated.nifRc,
        nis: updated.nis,
        documentFooter: updated.documentFooter,
        currency: updated.currency,
        defaultLocationId: updated.defaultLocationId,
        logoUrl: updated.logoUrl,
        backupRetentionCount: updated.backupRetentionCount,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (error) {
    console.error("Erreur mise à jour paramètres:", error);
    return { success: false, error: "Erreur lors de l'enregistrement des paramètres." };
  }
}

// ─── 2. GESTION DU LOGO DU MAGASIN ──────────────────────────────────────────

export async function uploadLogoAction(
  formData: FormData
): Promise<{ success: boolean; logoUrl?: string; error?: string }> {
  try {
    const file = formData.get("logo") as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: "Aucun fichier image sélectionné." };
    }

    // 1. Validation de la taille (5 Mo max)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return { success: false, error: "L'image dépasse la taille maximale autorisée (5 Mo)." };
    }

    // 2. Validation du type MIME
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
      return {
        success: false,
        error: "Format de fichier non supporté. Veuillez utiliser PNG, JPG, WebP ou SVG.",
      };
    }

    // 3. Déterminer l'extension sûre
    let ext = ".png";
    if (file.type.toLowerCase().includes("jpeg") || file.type.toLowerCase().includes("jpg")) ext = ".jpg";
    else if (file.type.toLowerCase().includes("webp")) ext = ".webp";
    else if (file.type.toLowerCase().includes("svg")) ext = ".svg";

    // 4. Emplacement de stockage sécurisé
    const uploadDir = path.resolve(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeFilename = `logo_shop_${Date.now()}${ext}`;
    const destinationPath = path.resolve(uploadDir, safeFilename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(destinationPath, buffer);

    const logoUrl = `/uploads/${safeFilename}`;

    // 5. Sauvegarde en base
    await prisma.shopSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        shopName: DEFAULT_SETTINGS.shopName,
        logoUrl,
      },
      update: {
        logoUrl,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/sales");
    revalidatePath("/purchases");
    revalidatePath("/cash");

    return { success: true, logoUrl };
  } catch (error) {
    console.error("Erreur lors du téléchargement du logo:", error);
    return { success: false, error: "Échec du téléchargement du logo." };
  }
}

export async function deleteLogoAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const current = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    if (current?.logoUrl) {
      const cleanPath = path.basename(current.logoUrl);
      const filePath = path.resolve(process.cwd(), "public", "uploads", cleanPath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup error
        }
      }
    }

    await prisma.shopSettings.update({
      where: { id: 1 },
      data: { logoUrl: null },
    });

    revalidatePath("/settings");
    revalidatePath("/sales");
    revalidatePath("/purchases");
    revalidatePath("/cash");

    return { success: true };
  } catch (error) {
    console.error("Erreur suppression logo:", error);
    return { success: false, error: "Échec de la suppression du logo." };
  }
}

// ─── 3. GESTION DES SAUVEGARDES (BACKUP) ──────────────────────────────────────

async function verifyBackupIntegrity(filePath: string): Promise<{ ok: boolean; message: string }> {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: "Fichier de sauvegarde introuvable sur le disque." };
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    return { ok: false, message: "Fichier de sauvegarde vide (0 octet)." };
  }

  const client = createClient({ url: `file:${filePath}` });
  try {
    const checkRes = await client.execute("PRAGMA integrity_check");
    const isOk = checkRes.rows.length > 0 && checkRes.rows[0].integrity_check === "ok";
    if (!isOk) {
      return { ok: false, message: "Échec du contrôle d'intégrité SQLite (PRAGMA integrity_check non conforme)." };
    }

    // Vérifier la présence des tables clés du schéma
    const tablesRes = await client.execute(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('products', 'sales', 'customers', 'shop_settings', 'cash_sessions')"
    );
    const count = Number(tablesRes.rows[0]?.cnt ?? 0);
    if (count < 2) {
      return { ok: false, message: "Structure de base incomplète : tables fondamentales absentes." };
    }

    return { ok: true, message: "Intégrité SQLite et schéma validés avec succès." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Erreur de lecture de la base : ${msg}` };
  } finally {
    await client.close();
  }
}

export async function listBackupsAction(): Promise<{
  success: boolean;
  backups: BackupFileInfo[];
  latestVerified?: string;
  error?: string;
}> {
  try {
    const backupDir = getBackupDir();
    const allFiles = fs.readdirSync(backupDir);

    const validExtensions = [".db", ".bak"];
    const backupFiles = allFiles.filter((f) => {
      const lower = f.toLowerCase();
      return (
        validExtensions.some((ext) => lower.endsWith(ext)) ||
        lower.startsWith("shop_backup_") ||
        lower.startsWith("shop.db.bak_") ||
        lower.startsWith("pre_restore_")
      );
    });

    const results: BackupFileInfo[] = [];

    for (const filename of backupFiles) {
      try {
        const fullPath = path.resolve(backupDir, filename);
        const stat = fs.statSync(fullPath);
        const { ok, message } = await verifyBackupIntegrity(fullPath);

        results.push({
          filename,
          size: stat.size,
          formattedSize: formatBytes(stat.size),
          createdAt: stat.mtime.toISOString(),
          isVerified: ok,
          verificationMessage: message,
          isPreRestore: filename.startsWith("pre_restore_"),
        });
      } catch {
        // En cas d'erreur de lecture d'un fichier spécifique
      }
    }

    // Tri par date décroissante (plus récent d'abord)
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const latestVerified = results.find((b) => b.isVerified && !b.isPreRestore)?.filename || results.find((b) => b.isVerified)?.filename;

    return { success: true, backups: results, latestVerified };
  } catch (error) {
    console.error("Erreur lors de la liste des sauvegardes:", error);
    return { success: false, backups: [], error: "Impossible de lister les fichiers de sauvegarde." };
  }
}

export async function createBackupAction(): Promise<{
  success: boolean;
  backup?: BackupFileInfo;
  error?: string;
}> {
  const dbPath = getDatabasePath();
  const backupDir = getBackupDir();

  if (!fs.existsSync(dbPath)) {
    return { success: false, error: "La base de données active est introuvable." };
  }

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  const backupFilename = `shop_backup_${timestamp}.db`;
  const backupPath = path.resolve(backupDir, backupFilename);
  const targetSql = backupPath.replace(/\\/g, "/");

  // 1. Exécuter un snapshot transaction-consistent via VACUUM INTO
  const activeClient = createClient({ url: `file:${dbPath}` });
  try {
    try {
      await activeClient.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore
    }
    await activeClient.execute(`VACUUM INTO '${targetSql}'`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Erreur VACUUM INTO:", err);
    return { success: false, error: `Échec de création du snapshot SQLite: ${msg}` };
  } finally {
    await activeClient.close();
  }

  // 2. Vérification rigoureuse d'intégrité de la nouvelle sauvegarde
  const integrity = await verifyBackupIntegrity(backupPath);
  if (!integrity.ok) {
    // Si l'intégrité a échoué, on détruit le fichier corrompu pour ne jamais garder une sauvegarde invalide
    try {
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    } catch {
      // ignore
    }
    return {
      success: false,
      error: `La sauvegarde créée a échoué au test d'intégrité : ${integrity.message}`,
    };
  }

  // 3. Application de la politique de rétention (garder les N plus récentes, SANS jamais supprimer la dernière)
  try {
    const settings = await getShopSettings();
    const maxKeep = Math.max(5, settings.backupRetentionCount || 30);

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("shop_backup_") || f.startsWith("shop.db.bak_"))
      .map((f) => {
        const full = path.join(backupDir, f);
        return { name: f, time: fs.statSync(full).mtime.getTime(), full };
      })
      .sort((a, b) => b.time - a.time);

    // On ne supprime que si on dépasse maxKeep ET on garde au minimum 1 sauvegarde valide
    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const item of toDelete) {
        // Sécurité supplémentaire : ne jamais supprimer le fichier qu'on vient de créer
        if (item.name !== backupFilename) {
          try {
            fs.unlinkSync(item.full);
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    console.warn("Avertissement politique de rétention:", err);
  }

  const stat = fs.statSync(backupPath);
  const backup: BackupFileInfo = {
    filename: backupFilename,
    size: stat.size,
    formattedSize: formatBytes(stat.size),
    createdAt: stat.mtime.toISOString(),
    isVerified: true,
    verificationMessage: integrity.message,
    isPreRestore: false,
  };

  revalidatePath("/settings");
  return { success: true, backup };
}

export async function verifyBackupAction(
  filename: string
): Promise<{ success: boolean; verified: boolean; message: string; error?: string }> {
  try {
    const { safePath } = resolveSafeBackupPath(filename);
    const integrity = await verifyBackupIntegrity(safePath);
    return { success: true, verified: integrity.ok, message: integrity.message };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, verified: false, message: msg, error: msg };
  }
}

export async function deleteBackupAction(
  filename: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { safePath, cleanName } = resolveSafeBackupPath(filename);

    if (!fs.existsSync(safePath)) {
      return { success: false, error: "Le fichier de sauvegarde spécifié n'existe pas." };
    }

    // Protection essentielle : ne jamais supprimer la seule sauvegarde valide existante !
    const listRes = await listBackupsAction();
    const verifiedBackups = listRes.backups.filter((b) => b.isVerified);
    if (verifiedBackups.length <= 1 && verifiedBackups.some((b) => b.filename === cleanName)) {
      return {
        success: false,
        error:
          "Protection des données : Impossible de supprimer la seule sauvegarde valide existante du système.",
      };
    }

    fs.unlinkSync(safePath);
    revalidatePath("/settings");
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Erreur lors de la suppression : ${msg}` };
  }
}

// ─── 4. RESTAURATION DE LA BASE DE DONNÉES (WORKFLOW SÉCURISÉ) ────────────────

export async function restoreBackupAction(
  filename: string,
  confirmBackupName: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  // 1. Protection contre les concurrences de restauration
  if (isDatabaseRestoring()) {
    return {
      success: false,
      error: "Une opération de restauration est déjà en cours d'exécution. Veuillez patienter.",
    };
  }

  // 2. Validation de l'intention explicite
  if (filename.trim() !== confirmBackupName.trim()) {
    return {
      success: false,
      error: "Confirmation invalide. Vous devez saisir exactement le nom du fichier de sauvegarde à restaurer.",
    };
  }

  // 3. Résolution sécurisée du fichier (anti-traversal)
  const { safePath, cleanName } = resolveSafeBackupPath(filename);

  if (!fs.existsSync(safePath)) {
    return { success: false, error: "Le fichier de sauvegarde sélectionné est introuvable." };
  }

  // 4. Vérification rigoureuse de l'intégrité de la sauvegarde candidate AVANT TOUTE OPÉRATION
  const candidateIntegrity = await verifyBackupIntegrity(safePath);
  if (!candidateIntegrity.ok) {
    return {
      success: false,
      error: `Restauration rejetée : Le fichier sélectionné n'est pas une base de données valide (${candidateIntegrity.message}).`,
    };
  }

  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);
  const backupDir = getBackupDir();

  // Verrouillage de restauration actif
  setDatabaseRestoring(true);

  let preRestoreFilename = "";

  try {
    // 5. CRÉATION D'UNE SAUVEGARDE DE SÉCURITÉ PRÉ-RESTAURATION DE LA BASE ACTIVE
    // Même en cas d'imprévu lors de la restauration, l'état actuel ne sera JAMAIS perdu !
    const preRestoreTimestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    preRestoreFilename = `pre_restore_${preRestoreTimestamp}.db`;
    const preRestorePath = path.resolve(backupDir, preRestoreFilename);
    const preRestoreSql = preRestorePath.replace(/\\/g, "/");

    if (fs.existsSync(dbPath)) {
      const activeClient = createClient({ url: `file:${dbPath}` });
      try {
        try {
          await activeClient.execute("PRAGMA wal_checkpoint(TRUNCATE)");
        } catch {
          // ignore
        }
        await activeClient.execute(`VACUUM INTO '${preRestoreSql}'`);
      } catch (backupErr: unknown) {
        const msg = backupErr instanceof Error ? backupErr.message : String(backupErr);
        return {
          success: false,
          error: `Impossible de créer la sauvegarde de sécurité préalable. Restauration annulée par précaution (${msg}).`,
        };
      } finally {
        await activeClient.close();
      }

      // Vérifier que la sauvegarde de sécurité est elle-même valide
      const preRestoreCheck = await verifyBackupIntegrity(preRestorePath);
      if (!preRestoreCheck.ok) {
        return {
          success: false,
          error: "La sauvegarde de sécurité pré-restauration n'a pas pu être vérifiée. Opération annulée.",
        };
      }
    }

    // 6. Fermeture explicite de TOUTES les connexions Prisma & LibSQL
    await disconnectPrismaClient();

    // Checkpoint et fermeture finale sur dbPath
    try {
      const flushClient = createClient({ url: `file:${dbPath}` });
      await flushClient.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      await flushClient.close();
    } catch {
      // ignore
    }

    // 7. Remplacement étagé avec rollback garanti sur Windows
    const stagingTempFile = path.resolve(dbDir, `shop.db.staging_${Date.now()}.tmp`);
    const currentBakFile = path.resolve(dbDir, `shop.db.current_rollback.bak`);

    // a. Copier la sauvegarde candidate vers le fichier temporaire d'étage
    fs.copyFileSync(safePath, stagingTempFile);

    // b. Vérifier l'intégrité du fichier étagé avant tout remplacement
    const stagingIntegrity = await verifyBackupIntegrity(stagingTempFile);
    if (!stagingIntegrity.ok) {
      if (fs.existsSync(stagingTempFile)) fs.unlinkSync(stagingTempFile);
      return {
        success: false,
        error: `Échec de vérification du fichier temporaire de restauration (${stagingIntegrity.message}). Restauration annulée.`,
      };
    }

    // c. Supprimer les fichiers WAL et SHM résiduels de l'ancienne base pour éviter tout rejeu
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (fs.existsSync(walPath)) {
      try {
        fs.unlinkSync(walPath);
      } catch {
        // ignore
      }
    }
    if (fs.existsSync(shmPath)) {
      try {
        fs.unlinkSync(shmPath);
      } catch {
        // ignore
      }
    }

    // d. Création du point de rollback local rapide
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, currentBakFile);
    }

    // e. Remplacement
    try {
      fs.copyFileSync(stagingTempFile, dbPath);
    } catch (swapErr) {
      console.error("Échec de copie du fichier de restauration:", swapErr);
      // Rollback immédiat
      if (fs.existsSync(currentBakFile)) {
        try {
          fs.copyFileSync(currentBakFile, dbPath);
        } catch {
          // ignore
        }
      }
      return {
        success: false,
        error: "Échec du remplacement du fichier de base de données. Rollback exécuté, état actuel préservé.",
      };
    } finally {
      // Nettoyage des fichiers temporaires
      try {
        if (fs.existsSync(stagingTempFile)) fs.unlinkSync(stagingTempFile);
      } catch {
        // ignore
      }
      try {
        if (fs.existsSync(currentBakFile)) fs.unlinkSync(currentBakFile);
      } catch {
        // ignore
      }
    }

    // 8. Réinitialisation et reconnexion du client Prisma
    resetPrismaClient();

    // 9. Vérification post-restauration de la base active
    const postCheck = await verifyBackupIntegrity(dbPath);
    if (!postCheck.ok) {
      return {
        success: false,
        error: `Avertissement critique : La base a été restaurée mais présente une anomalie : ${postCheck.message}. Utilisez ${preRestoreFilename} si nécessaire.`,
      };
    }

    revalidatePath("/settings");
    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/purchases");
    revalidatePath("/cash");

    return {
      success: true,
      message: `La base de données a été restaurée avec succès depuis "${cleanName}". Une sauvegarde de sécurité (${preRestoreFilename}) a été créée automatiquement avant le remplacement.`,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Erreur fatale restauration:", error);
    return { success: false, error: `Erreur inattendue pendant la restauration : ${msg}` };
  } finally {
    setDatabaseRestoring(false);
  }
}

// ─── 5. INFORMATIONS SYSTÈME & EMPLACEMENTS ──────────────────────────────────

export async function getSystemInfoAction(): Promise<SystemInfo> {
  const dbPath = getDatabasePath();
  let dbSize = 0;
  if (fs.existsSync(dbPath)) {
    try {
      dbSize = fs.statSync(dbPath).size;
    } catch {
      // ignore
    }
  }

  const list = await listBackupsAction();
  const verifiedList = list.backups.filter((b) => b.isVerified);

  return {
    databasePath: "prisma/shop.db (Stockage local sécurisé SQLite / LibSQL)",
    databaseSizeBytes: dbSize,
    formattedDatabaseSize: formatBytes(dbSize),
    backupCount: list.backups.length,
    verifiedBackupCount: verifiedList.length,
    latestVerifiedBackupName: list.latestVerified,
    latestVerifiedBackupTime: list.backups.find((b) => b.filename === list.latestVerified)?.createdAt,
    walMode: true,
    activeClientStatus: "Connecté (Prisma 7 + LibSQL pure-JS adapter)",
  };
}

export async function getLocationsAction(): Promise<Array<{ id: number; name: string; code: string }>> {
  try {
    const locations = await prisma.location.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    return locations;
  } catch {
    return [];
  }
}
