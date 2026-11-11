import { prisma, type DbClient, type TxClient } from "@/server/db";
import { roundMoney } from "@/lib/formatters";

export async function generateNextSavingsReference(
  type: "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL" = "DEPOSIT",
  txClient?: TxClient
): Promise<string> {
  const db: DbClient = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `SAV-${yearMonth}-`;

  const lastTx = await db.customerSavingsTransaction.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastTx?.reference) {
    const parts = lastTx.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export function findSavingsAccountByCustomer(customerId: number, db: DbClient = prisma) {
  return db.customerSavingsAccount.findUnique({ where: { customerId } });
}

export function findShopSettingsFirst(db: DbClient = prisma) {
  return db.shopSettings.findFirst({ where: { id: 1 } });
}

export function fetchSavingsOverviewQueries(db: DbClient = prisma) {
  return Promise.all([
    db.customerSavingsAccount.findMany({
      include: {
        customer: {
          select: { id: true, code: true, name: true, phone: true, phone2: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: { balance: "desc" },
    }),
    db.customerSavingsTransaction.findMany({
      take: 60,
      include: {
        customer: {
          select: { id: true, name: true },
        },
        sale: {
          select: { id: true, reference: true },
        },
        session: {
          select: { id: true, reference: true },
        },
      },
      orderBy: { date: "desc" },
    }),
    db.customer.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, phone: true, phone2: true },
      orderBy: { name: "asc" },
    }),
    db.cashSession.findFirst({
      where: { status: "open" },
      select: { id: true, reference: true },
    }),
    findShopSettingsFirst(db),
  ]);
}

export function fetchSavingsCustomerDetails(id: number, db: DbClient = prisma) {
  return Promise.all([
    db.customer.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, phone: true, phone2: true, address: true },
    }),
    db.customerSavingsAccount.findUnique({
      where: { customerId: id },
    }),
    db.customerSavingsTransaction.findMany({
      where: { customerId: id },
      include: {
        sale: { select: { id: true, reference: true, totalAmount: true, paidAmount: true } },
        session: { select: { id: true, reference: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    db.sales.findMany({
      where: {
        customerId: id,
        status: { in: ["confirmed", "draft"] },
        paymentStatus: { in: ["unpaid", "partial"] },
      },
      select: {
        id: true,
        reference: true,
        totalAmount: true,
        paidAmount: true,
        paymentStatus: true,
        saleDate: true,
      },
      orderBy: { saleDate: "desc" },
    }),
  ]);
}

export function findCustomerStatusById(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
}

export function findCustomerNameOnly(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
}

export function findSavingsTransactionWithDetails(transactionId: number, db: DbClient = prisma) {
  return db.customerSavingsTransaction.findUnique({
    where: { id: transactionId },
    include: {
      customer: true,
      sale: { select: { id: true, reference: true } },
      session: { select: { id: true, reference: true } },
    },
  });
}

export function fetchSavingsStatementQueries(
  id: number,
  startDate?: string,
  endDate?: string,
  db: DbClient = prisma
) {
  return Promise.all([
    db.customer.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, phone: true, phone2: true, address: true },
    }),
    db.customerSavingsAccount.findUnique({
      where: { customerId: id },
    }),
    db.customerSavingsTransaction.findMany({
      where: {
        customerId: id,
        ...(startDate ? { date: { gte: new Date(startDate) } } : {}),
        ...(endDate ? { date: { lte: new Date(endDate) } } : {}),
      },
      include: {
        sale: { select: { reference: true } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    findShopSettingsFirst(db),
  ]);
}

export function createSavingsTransactionRecord(
  tx: TxClient,
  data: {
    reference: string;
    customerId: number;
    accountId: number;
    type: string;
    amount: number;
    direction: string;
    balanceBefore: number;
    balanceAfter: number;
    paymentMethod: string;
    saleId?: number | null;
    relatedTransactionId?: number | null;
    description: string;
    notes?: string | null;
    date: Date;
  }
) {
  return tx.customerSavingsTransaction.create({ data });
}

export function updateSavingsAccountBalance(
  tx: TxClient,
  accountId: number,
  data: { balance: number; totalUsed: number }
) {
  return tx.customerSavingsAccount.update({
    where: { id: accountId },
    data,
  });
}

export async function reverseSavingsDeductionsForSale(
  tx: TxClient,
  saleId: number,
  customerId: number,
  reason: string
): Promise<string[]> {
  // Trouver toutes les transactions USAGE sur cette vente
  const usages = await tx.customerSavingsTransaction.findMany({
    where: {
      saleId,
      type: "USAGE",
      status: "completed",
    },
    include: {
      account: true,
    },
  });

  if (usages.length === 0) return [];

  const reversedRefs: string[] = [];
  const now = new Date();

  for (const usage of usages) {
    // Vérifier si un REVERSAL existe déjà pour cet USAGE (idempotence stricte)
    const existingReversal = await tx.customerSavingsTransaction.findFirst({
      where: {
        relatedTransactionId: usage.id,
        type: "REVERSAL",
      },
    });

    if (existingReversal) continue; // Déjà rétrocédé

    const account = await tx.customerSavingsAccount.findUnique({
      where: { id: usage.accountId },
    });
    if (!account) continue;

    const revRef = await generateNextSavingsReference("REVERSAL", tx);
    const balanceBefore = account.balance;
    const balanceAfter = roundMoney(balanceBefore + usage.amount);

    // 1. Écriture compensatoire REVERSAL au grand livre
    await tx.customerSavingsTransaction.create({
      data: {
        reference: revRef,
        customerId: usage.customerId,
        accountId: account.id,
        type: "REVERSAL",
        amount: usage.amount,
        direction: "IN",
        balanceBefore,
        balanceAfter,
        paymentMethod: "savings",
        saleId,
        relatedTransactionId: usage.id,
        description: `Rétablissement d'épargne suite annulation vente (${reason})`,
        notes: `Rétablissement de ${usage.amount.toLocaleString("fr-DZ")} DA. Transaction d'origine : ${usage.reference}`,
        date: now,
      },
    });

    // 2. Mettre à jour le solde d'épargne du client (rétablir l'avoir)
    await tx.customerSavingsAccount.update({
      where: { id: account.id },
      data: {
        balance: balanceAfter,
        totalUsed: Math.max(0, roundMoney(account.totalUsed - usage.amount)),
      },
    });

    reversedRefs.push(revRef);
  }

  return reversedRefs;
}
