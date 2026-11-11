import { prisma, type DbClient, type TxClient } from "@/server/db";

// ─── LECTURES COMMANDES ──────────────────────────────────────────────────────

export function findPurchaseForUpdate(purchaseId: number, db: DbClient = prisma) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: true,
      items: {
        include: {
          product: true,
          receiptItems: true,
        },
      },
      receipts: {
        include: {
          items: true,
        },
      },
      payments: {
        where: { status: { not: "cancelled" } },
      },
    },
  });
}

export function findPurchaseWithSupplier(purchaseId: number, db: DbClient = prisma) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: { supplier: true },
  });
}

export function findPurchaseForCancel(purchaseId: number, db: DbClient = prisma) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      items: true,
      receipts: true,
      payments: true,
    },
  });
}

export function findReceiptWithDetails(receiptId: number, db: DbClient = prisma) {
  return db.purchaseReceipt.findUnique({
    where: { id: receiptId },
    include: {
      purchase: {
        include: {
          supplier: true,
        },
      },
      items: {
        include: {
          product: {
            select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true },
          },
          location: {
            select: { id: true, name: true, code: true },
          },
          purchaseItem: {
            select: { id: true, quantity: true, unitCost: true },
          },
        },
      },
    },
  });
}

export function findPurchasesWithDetails(searchQuery?: string, db: DbClient = prisma) {
  const query = searchQuery?.trim();

  const whereClause = query
    ? {
        OR: [
          { reference: { contains: query } },
          { supplier: { name: { contains: query } } },
          { supplier: { code: { contains: query } } },
          { notes: { contains: query } },
        ],
      }
    : {};

  return db.purchase.findMany({
    where: whereClause,
    include: {
      supplier: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              model: true,
              color: true,
              costPrice: true,
              sellingPrice: true,
              stock: true,
            },
          },
          location: {
            select: { id: true, name: true, code: true },
          },
        },
      },
      receipts: {
        include: {
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true },
              },
              location: {
                select: { id: true, name: true, code: true },
              },
              purchaseItem: {
                select: { id: true, quantity: true, unitCost: true },
              },
            },
          },
        },
        orderBy: { receiptDate: "desc" },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
    orderBy: { purchaseDate: "desc" },
  });
}

// ─── DONNÉES DU MODULE ACHATS ────────────────────────────────────────────────

export function findActiveSuppliersLite(db: DbClient = prisma) {
  return db.supplier.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, phone: true, address: true },
    orderBy: { name: "asc" },
  });
}

export function findProductsLite(db: DbClient = prisma) {
  return db.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      model: true,
      color: true,
      costPrice: true,
      sellingPrice: true,
      stock: true,
    },
    orderBy: { name: "asc" },
  });
}

export function findActiveLocationsLite(db: DbClient = prisma) {
  return db.location.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export function findActiveTreasuryAccountsLite(db: DbClient = prisma) {
  return db.treasuryAccount.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true, type: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

// ─── ÉCRITURES COMMANDES ─────────────────────────────────────────────────────

export function updatePurchaseRecord(
  tx: TxClient,
  id: number,
  data: Record<string, unknown>,
  include?: object
) {
  return tx.purchase.update({
    where: { id },
    data,
    ...(include ? { include } : {}),
  });
}

export function cancelPaymentsForPurchase(tx: TxClient, purchaseId: number, notes: string) {
  return tx.payment.updateMany({
    where: { purchaseId },
    data: { status: "cancelled", notes },
  });
}
