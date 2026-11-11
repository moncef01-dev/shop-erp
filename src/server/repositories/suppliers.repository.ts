import { prisma, type DbClient, type TxClient } from "@/server/db";

export async function calculateSupplierDebt(
  supplierId: number,
  txClient?: TxClient
): Promise<{
  initialDebt: number;
  totalPurchases: number;
  totalPaid: number;
  totalReturns: number;
  totalAllocated: number;
  outstandingDebt: number;
  outstandingCredit: number;
}> {
  const db: DbClient = txClient || prisma;

  // 1. Dettes initiales / antérieures (hors retours)
  const debtsAgg = await db.supplierDebt.aggregate({
    where: { supplierId, type: { notIn: ["supplier_return", "return"] } },
    _sum: { amount: true },
  });
  const initialDebt = debtsAgg._sum.amount ?? 0;

  // 2. Retours marchandises / Avoirs (déduits de la dette)
  const returnsAgg = await db.supplierDebt.aggregate({
    where: { supplierId, type: { in: ["supplier_return", "return"] } },
    _sum: { amount: true },
  });
  const totalReturns = returnsAgg._sum.amount ?? 0;

  // 3. Achats confirmés dans le système
  const purchasesAgg = await db.purchase.aggregate({
    where: {
      supplierId,
      status: { not: "cancelled" },
    },
    _sum: { totalAmount: true },
  });
  const totalPurchases = purchasesAgg._sum.totalAmount ?? 0;

  // 4. Paiements effectués au fournisseur
  const paymentsAgg = await db.payment.aggregate({
    where: {
      status: { not: "cancelled" },
      OR: [
        { supplierId },
        { purchase: { supplierId } },
      ],
    },
    _sum: { amount: true },
  });
  const totalPaid = paymentsAgg._sum.amount ?? 0;

  // 5. Imputations de versements supplémentaires sur la dette
  let totalAllocated = 0;
  try {
    const allocAgg = await db.supplierAdditionalPaymentAllocation.aggregate({
      where: {
        supplierId,
        status: "completed",
        isReversal: false,
      },
      _sum: { amount: true },
    });
    totalAllocated = allocAgg._sum.amount ?? 0;
  } catch {
    // Ignore si la table n'est pas encore initialisée
  }

  const netBalance = initialDebt + totalPurchases - totalPaid - totalReturns - totalAllocated;
  const outstandingDebt = Math.max(0, netBalance);
  const outstandingCredit = Math.max(0, -netBalance);

  return {
    initialDebt: Math.round(initialDebt * 100) / 100,
    totalPurchases: Math.round(totalPurchases * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalReturns: Math.round(totalReturns * 100) / 100,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    outstandingDebt: Math.round(outstandingDebt * 100) / 100,
    outstandingCredit: Math.round(outstandingCredit * 100) / 100,
  };
}

export function findSupplierById(id: number, db: DbClient = prisma) {
  return db.supplier.findUnique({ where: { id } });
}

export function findSupplierDebtById(id: number, db: DbClient = prisma) {
  return db.supplierDebt.findUnique({ where: { id } });
}

export function findSupplierByPhone(phone: string, excludeId?: number, db: DbClient = prisma) {
  return db.supplier.findFirst({
    where: {
      phone: { equals: phone },
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });
}

export function findSuppliersWithPurchaseHistory(searchQuery?: string, db: DbClient = prisma) {
  const query = searchQuery?.trim();

  const whereClause = query
    ? {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
          { code: { contains: query } },
          { email: { contains: query } },
          { address: { contains: query } },
        ],
      }
    : {};

  return db.supplier.findMany({
    where: whereClause,
    include: {
      purchases: {
        where: { status: { not: "cancelled" } },
        select: {
          id: true,
          reference: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          paymentStatus: true,
          receiptStatus: true,
          purchaseDate: true,
        },
        orderBy: { purchaseDate: "desc" },
      },
      _count: {
        select: { purchases: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function findLastSupplierPayment(supplierId: number, db: DbClient = prisma) {
  return db.payment.findFirst({
    where: {
      status: { not: "cancelled" },
      OR: [{ supplierId }, { purchase: { supplierId } }],
    },
    orderBy: { paymentDate: "desc" },
    select: { paymentDate: true },
  });
}

export function findSupplierStatusById(id: number, db: DbClient = prisma) {
  return db.supplier.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
}

export function findSupplierWithCounts(id: number, db: DbClient = prisma) {
  return db.supplier.findUnique({
    where: { id },
    include: {
      _count: { select: { purchases: true, payments: true, debts: true } },
    },
  });
}

export function findSupplierWithFullHistory(id: number, db: DbClient = prisma) {
  return db.supplier.findUnique({
    where: { id },
    include: {
      purchases: {
        include: {
          items: {
            include: {
              product: { select: { id: true, sku: true, name: true, model: true, color: true } },
              location: { select: { id: true, name: true, code: true } },
            },
          },
          payments: {
            orderBy: { paymentDate: "desc" },
          },
          receipts: {
            include: {
              items: {
                include: {
                  product: { select: { id: true, sku: true, name: true } },
                  location: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { receiptDate: "desc" },
          },
        },
        orderBy: { purchaseDate: "desc" },
      },
    },
  });
}

export function createSupplierRecord(
  data: {
    code: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    isActive: boolean;
  },
  db: DbClient = prisma
) {
  return db.supplier.create({ data });
}

export function updateSupplierRecord(
  id: number,
  data: Record<string, unknown>,
  db: DbClient = prisma
) {
  return db.supplier.update({ where: { id }, data });
}

export function deleteSupplierRecord(id: number, db: DbClient = prisma) {
  return db.supplier.delete({ where: { id } });
}

// ─── DETTES FOURNISSEURS ─────────────────────────────────────────────────────

export function findSupplierDebtDuplicate(
  supplierId: number,
  amount: number,
  description: string,
  db: DbClient = prisma
) {
  return db.supplierDebt.findFirst({
    where: { supplierId, amount, description },
  });
}

export function findRecentSupplierDebt(
  supplierId: number,
  amount: number,
  since: Date,
  db: DbClient = prisma
) {
  return db.supplierDebt.findFirst({
    where: { supplierId, amount, createdAt: { gte: since } },
  });
}

export function findSupplierDebtByReference(reference: string, db: DbClient = prisma) {
  return db.supplierDebt.findUnique({ where: { reference } });
}

export function createSupplierDebtRecord(
  data: {
    reference: string;
    supplierId: number;
    amount: number;
    type: string;
    description: string;
    notes: string | null;
    date: Date;
  },
  db: DbClient = prisma
) {
  return db.supplierDebt.create({ data });
}

export function findSupplierDebtsOrdered(supplierId: number, db: DbClient = prisma) {
  return db.supplierDebt.findMany({
    where: { supplierId },
    orderBy: { date: "asc" },
  });
}

// ─── RELEVÉ DE COMPTE & LISTES ───────────────────────────────────────────────

export function findPurchaseLiteForPayment(purchaseId: number, db: DbClient = prisma) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    select: { supplierId: true, totalAmount: true, paidAmount: true, status: true },
  });
}

export function findPaymentWithFullDetails(paymentId: number, db: DbClient = prisma) {
  return db.payment.findUnique({
    where: { id: paymentId },
    include: {
      supplier: true,
      purchase: true,
      session: true,
      account: true,
    },
  });
}

export function findSupplierPurchasesOrdered(supplierId: number, db: DbClient = prisma) {
  return db.purchase.findMany({
    where: {
      supplierId,
      status: { not: "cancelled" },
    },
    orderBy: { purchaseDate: "asc" },
  });
}

export function findSupplierPaymentsOrdered(supplierId: number, db: DbClient = prisma) {
  return db.payment.findMany({
    where: {
      status: { not: "cancelled" },
      OR: [{ supplierId }, { purchase: { supplierId } }],
    },
    include: {
      account: { select: { name: true } },
      purchase: { select: { reference: true } },
    },
    orderBy: { paymentDate: "asc" },
  });
}

export function findSupplierAllocations(supplierId: number, db: DbClient = prisma) {
  return db.supplierAdditionalPaymentAllocation.findMany({
    where: {
      supplierId,
      status: "completed",
      isReversal: false,
    },
    include: {
      payment: { select: { reference: true } },
      purchase: { select: { reference: true } },
    },
    orderBy: { date: "asc" },
  });
}

export function findSuppliersOrderedByName(searchQuery?: string, db: DbClient = prisma) {
  const query = searchQuery?.trim();

  const whereClause = query
    ? {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
          { code: { contains: query } },
          { address: { contains: query } },
        ],
      }
    : {};

  return db.supplier.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
  });
}

export function countSupplierPurchases(supplierId: number, db: DbClient = prisma) {
  return db.purchase.count({
    where: { supplierId, status: { not: "cancelled" } },
  });
}

export function countSupplierPayments(supplierId: number, db: DbClient = prisma) {
  return db.payment.count({
    where: {
      status: { not: "cancelled" },
      OR: [{ supplierId }, { purchase: { supplierId } }],
    },
  });
}

export function findLastPurchaseForSupplier(supplierId: number, db: DbClient = prisma) {
  return db.purchase.findFirst({
    where: { supplierId, status: { not: "cancelled" } },
    orderBy: { purchaseDate: "desc" },
    select: { purchaseDate: true },
  });
}

// ─── VERSEMENTS SUPPLÉMENTAIRES FOURNISSEURS ─────────────────────────────────

export function aggregateSupplierAdditionalPayments(supplierId: number, db: DbClient = prisma) {
  return Promise.all([
    db.supplierAdditionalPayment.aggregate({
      where: { supplierId, isReversal: false },
      _sum: { amount: true },
    }),
    db.supplierAdditionalPayment.aggregate({
      where: { supplierId, isReversal: true, status: "completed" },
      _sum: { amount: true },
    }),
  ]);
}

export function findSupplierAdditionalPaymentHistory(supplierId: number, db: DbClient = prisma) {
  return db.supplierAdditionalPayment.findMany({
    where: { supplierId },
    include: {
      treasuryAccount: {
        select: { id: true, name: true, code: true, type: true },
      },
      session: {
        select: { id: true, reference: true, status: true },
      },
      reversal: {
        select: { id: true, reference: true, date: true, createdAt: true, reversalReason: true },
      },
      reversalOf: {
        select: { id: true, reference: true },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export function aggregateSupplierAllocations(supplierId: number, db: DbClient = prisma) {
  return db.supplierAdditionalPaymentAllocation.aggregate({
    where: {
      supplierId,
      isReversal: false,
      status: "completed",
    },
    _sum: { amount: true },
  });
}

export function findEligibleAdditionalPayments(supplierId: number, db: DbClient = prisma) {
  return db.supplierAdditionalPayment.findMany({
    where: {
      supplierId,
      isReversal: false,
      status: "completed",
    },
    include: {
      treasuryAccount: {
        select: { name: true },
      },
      allocations: {
        where: {
          isReversal: false,
          status: "completed",
        },
        select: {
          amount: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });
}

export function findSupplierAllocationHistory(supplierId: number, db: DbClient = prisma) {
  return db.supplierAdditionalPaymentAllocation.findMany({
    where: { supplierId },
    include: {
      payment: {
        select: { id: true, reference: true, amount: true, date: true },
      },
      purchase: {
        select: { id: true, reference: true, totalAmount: true, paidAmount: true },
      },
      reversal: {
        select: { id: true, reference: true, date: true, reversalReason: true },
      },
      reversalOf: {
        select: { id: true, reference: true },
      },
    },
    orderBy: { date: "desc" },
  });
}

export function findSupplierUnpaidPurchases(supplierId: number, db: DbClient = prisma) {
  return db.purchase.findMany({
    where: {
      supplierId,
      status: { not: "cancelled" },
      paymentStatus: { in: ["unpaid", "partial"] },
    },
    orderBy: { purchaseDate: "desc" },
  });
}
