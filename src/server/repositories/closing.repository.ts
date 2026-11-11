import { prisma, type DbClient } from "@/server/db";
import type {
  MonthlyClosingSnapshotUpdateInput,
  MonthlyClosingPeriodCreateInput,
  MonthlyClosingPeriodUncheckedCreateInput,
  MonthlyClosingPeriodUpdateInput,
  MonthlyClosingPeriodUncheckedUpdateInput,
  MonthlyClosingAuditLogCreateInput,
  MonthlyClosingAuditLogUncheckedCreateInput,
} from "@/generated/prisma/sqlite/models";
import type { Prisma } from "@/generated/prisma/sqlite/client";

type SnapshotUpdateData = MonthlyClosingSnapshotUpdateInput;
type PeriodUpsertCreate = Prisma.XOR<MonthlyClosingPeriodCreateInput, MonthlyClosingPeriodUncheckedCreateInput>;
type PeriodUpsertUpdate = Prisma.XOR<MonthlyClosingPeriodUpdateInput, MonthlyClosingPeriodUncheckedUpdateInput>;
type AuditLogCreateData = Prisma.XOR<
  MonthlyClosingAuditLogCreateInput,
  MonthlyClosingAuditLogUncheckedCreateInput
>;

export async function generateNextMonthlySnapshotReference(monthStr: string, db: DbClient = prisma): Promise<string> {
  const cleanMonth = monthStr.replace("-", "");
  const prefix = `CLM-${cleanMonth}-`;

  const lastSnapshot = await db.monthlyClosingSnapshot.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastSnapshot?.reference) {
    const parts = lastSnapshot.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export function fetchMonthlyClosingDataQueries(month: string, db: DbClient = prisma) {
  return Promise.all([
    // Ventes
    db.sales.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { costPrice: true, sellingPrice: true } },
          },
        },
      },
      orderBy: { saleDate: "asc" },
    }),

    // Règlements (Ventes et Fournisseurs)
    db.payment.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
        sale: { select: { id: true, reference: true, saleDate: true, customerId: true } },
        purchase: { select: { id: true, reference: true, supplierId: true } },
      },
      orderBy: { paymentDate: "asc" },
    }),

    // Acomptes clients
    db.customerAdvance.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        account: { select: { id: true, name: true, code: true } },
        allocations: {
          select: { id: true, amount: true, allocatedAt: true, saleId: true },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),

    // Achats
    db.purchase.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
      orderBy: { purchaseDate: "asc" },
    }),

    // Dettes et retours fournisseurs
    db.supplierDebt.findMany({
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: "asc" },
    }),

    // Charges et produits exceptionnels
    db.expense.findMany({
      where: {
        status: { not: "cancelled" },
      },
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: { date: "asc" },
    }),

    // Comptes de trésorerie
    db.treasuryAccount.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    }),

    // Virements inter-comptes
    db.treasuryTransfer.findMany({
      include: {
        fromAccount: { select: { id: true, name: true, code: true } },
        toAccount: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: "asc" },
    }),

    // Sessions de caisse
    db.cashSession.findMany({
      include: {
        account: { select: { id: true, name: true, code: true } },
      },
      orderBy: { openedAt: "desc" },
    }),

    // Produits et valorisation de stock
    db.product.findMany({
      where: { isActive: true },
      include: {
        categoryRef: { select: { name: true } },
        stocks: {
          include: {
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),

    // Dépôts / Magasins
    db.location.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),

    // Pointage sauvegardé pour le mois
    db.monthlyClosingChecklist.findMany({
      where: { month },
    }),

    // Snapshots existants pour le mois
    db.monthlyClosingSnapshot.findMany({
      where: { month },
      orderBy: { version: "desc" },
    }),
  ]);
}

export function findMonthlyClosingPeriod(month: string, db: DbClient = prisma) {
  return db.monthlyClosingPeriod.findUnique({ where: { month } });
}

export function findMonthlyAuditLogs(month: string, db: DbClient = prisma) {
  return db.monthlyClosingAuditLog.findMany({
    where: { month },
    orderBy: { createdAt: "desc" },
  });
}

export function upsertMonthlyChecklistItem(
  params: {
    month: string;
    itemKey: string;
    status: string;
    note: string | null;
    checkedBy: string;
    checkedAt: Date | null;
  },
  db: DbClient = prisma
) {
  return db.monthlyClosingChecklist.upsert({
    where: {
      month_itemKey: {
        month: params.month,
        itemKey: params.itemKey,
      },
    },
    create: {
      month: params.month,
      itemKey: params.itemKey,
      status: params.status,
      note: params.note,
      checkedBy: params.checkedBy,
      checkedAt: params.checkedAt,
    },
    update: {
      status: params.status,
      note: params.note,
      checkedBy: params.checkedBy,
      checkedAt: params.checkedAt,
    },
  });
}

export function countMonthlySnapshots(month: string, db: DbClient = prisma) {
  return db.monthlyClosingSnapshot.count({ where: { month } });
}

export function createMonthlySnapshot(
  data: {
    reference: string;
    month: string;
    version: number;
    status: string;
    title: string;
    notes: string | null;
    generatedAt: Date;
    generatedBy: string;
    periodStart: Date;
    periodEnd: Date;
    totalsJson: string;
    checklistJson: string;
    discrepanciesJson: string;
  },
  db: DbClient = prisma
) {
  return db.monthlyClosingSnapshot.create({ data });
}

export function findMonthlySnapshotById(id: number, db: DbClient = prisma) {
  return db.monthlyClosingSnapshot.findUnique({ where: { id } });
}

export function updateMonthlySnapshot(
  id: number,
  data: SnapshotUpdateData,
  db: DbClient = prisma
) {
  return db.monthlyClosingSnapshot.update({ where: { id }, data });
}

export function upsertMonthlyPeriod(
  month: string,
  data: { create: PeriodUpsertCreate; update: PeriodUpsertUpdate },
  db: DbClient = prisma
) {
  return db.monthlyClosingPeriod.upsert({
    where: { month },
    create: data.create,
    update: data.update,
  });
}

export function createMonthlyAuditLog(
  data: AuditLogCreateData,
  db: DbClient = prisma
) {
  return db.monthlyClosingAuditLog.create({ data });
}
