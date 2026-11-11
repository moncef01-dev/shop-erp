import { prisma, type DbClient } from "@/server/db";

export function findShopSettingsById1(db: DbClient = prisma) {
  return db.shopSettings.findUnique({ where: { id: 1 } });
}

export function createShopSettingsDefaults(
  data: { id: number } & Record<string, unknown>,
  db: DbClient = prisma
) {
  return db.shopSettings.create({ data: data as never });
}

export function upsertShopSettings(
  data: {
    create: {
      id: number;
      shopName: string;
      activity: string | null;
      legalForm: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      nifRc: string | null;
      nis: string | null;
      documentFooter: string | null;
      currency: string;
      defaultLocationId: number | null;
      backupRetentionCount: number;
    };
    update: {
      shopName: string;
      activity: string | null;
      legalForm: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      nifRc: string | null;
      nis: string | null;
      documentFooter: string | null;
      currency: string;
      defaultLocationId: number | null;
      backupRetentionCount: number;
    };
  },
  db: DbClient = prisma
) {
  return db.shopSettings.upsert({
    where: { id: 1 },
    create: data.create,
    update: data.update,
  });
}

export function upsertShopSettingsLogo(
  logoUrl: string,
  defaultShopName: string,
  db: DbClient = prisma
) {
  return db.shopSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      shopName: defaultShopName,
      logoUrl,
    },
    update: {
      logoUrl,
    },
  });
}

export function clearShopSettingsLogo(db: DbClient = prisma) {
  return db.shopSettings.update({
    where: { id: 1 },
    data: { logoUrl: null },
  });
}

export function findLocationsForSettings(db: DbClient = prisma) {
  return db.location.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}
