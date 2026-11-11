"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import {
  findShopSettingsById1,
  createShopSettingsDefaults,
  upsertShopSettings,
  upsertShopSettingsLogo,
  clearShopSettingsLogo,
  findLocationsForSettings,
} from "@/server/repositories/settings.repository";
import {
  createBackup,
  restoreBackup,
  listBackups,
  verifyBackup,
  deleteBackup,
} from "@/server/services/backup";
import { supportsFileBackup, providerLabel } from "@/server/db/capabilities";

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

// ─── 1. PARAMÈTRES DU MAGASIN ────────────────────────────────────────────────

export async function getShopSettings(): Promise<ShopSettingsData> {
  try {
    let settings = await findShopSettingsById1();

    if (!settings) {
      settings = await createShopSettingsDefaults({
        id: 1,
        ...DEFAULT_SETTINGS,
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

    const updated = await upsertShopSettings({
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
    await upsertShopSettingsLogo(logoUrl, DEFAULT_SETTINGS.shopName);

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
    const current = await findShopSettingsById1();
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

    await clearShopSettingsLogo();

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

// ─── 2. SAUVEGARDE & RESTAURATION (délégation au service par fournisseur) ────

export async function listBackupsAction(): Promise<{
  success: boolean;
  backups: BackupFileInfo[];
  latestVerified?: string;
  error?: string;
}> {
  return listBackups();
}

export async function createBackupAction(): Promise<{
  success: boolean;
  backup?: BackupFileInfo;
  error?: string;
}> {
  const result = await createBackup();
  if (result.success) {
    revalidatePath("/settings");
  }
  return result;
}

export async function verifyBackupAction(
  filename: string
): Promise<{ success: boolean; verified: boolean; message: string; error?: string }> {
  return verifyBackup(filename);
}

export async function deleteBackupAction(
  filename: string
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteBackup(filename);
  if (result.success) {
    revalidatePath("/settings");
  }
  return result;
}

export async function restoreBackupAction(
  filename: string,
  confirmBackupName: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await restoreBackup(filename, confirmBackupName);
  if (result.success) {
    revalidatePath("/settings");
    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/purchases");
    revalidatePath("/cash");
  }
  return result;
}

// ─── 3. INFORMATIONS SYSTÈME & EMPLACEMENTS ──────────────────────────────────

export async function getSystemInfoAction(): Promise<SystemInfo> {
  if (!supportsFileBackup()) {
    return {
      databasePath: "PostgreSQL (POSTGRES_DATABASE_URL) — sauvegarde fichier non applicable",
      databaseSizeBytes: 0,
      formattedDatabaseSize: "N/A",
      backupCount: 0,
      verifiedBackupCount: 0,
      walMode: false,
      activeClientStatus: `Connecté (Prisma 7 — ${providerLabel()})`,
    };
  }

  const dbPath = getDatabasePath();
  let dbSize = 0;
  if (fs.existsSync(dbPath)) {
    try {
      dbSize = fs.statSync(dbPath).size;
    } catch {
      // ignore
    }
  }

  const list = await listBackups();
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
    activeClientStatus: `Connecté (Prisma 7 — ${providerLabel()})`,
  };
}

export async function getLocationsAction(): Promise<Array<{ id: number; name: string; code: string }>> {
  try {
    const locations = await findLocationsForSettings();
    return locations;
  } catch {
    return [];
  }
}
