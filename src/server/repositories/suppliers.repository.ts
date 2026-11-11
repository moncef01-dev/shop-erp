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
