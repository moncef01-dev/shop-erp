import { prisma, type DbClient, type TxClient } from "@/server/db";

export async function generateNextExpenseReference(
  type: "expense" | "income" = "expense",
  txClient?: TxClient
): Promise<string> {
  const db: DbClient = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = type === "income" ? `ENC-${yearMonth}-` : `DEP-${yearMonth}-`;

  const last = await db.expense.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (last?.reference) {
    const parts = last.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export function findOpenCashSession(db: DbClient = prisma) {
  return db.cashSession.findFirst({ where: { status: "open" } });
}

export function findOpenCashSessionId(db: DbClient = prisma) {
  return db.cashSession.findFirst({
    where: { status: "open" },
    select: { id: true },
  });
}

export function findDefaultCashAccount(db: DbClient = prisma) {
  return db.treasuryAccount.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  });
}

export function findCashAccountAny(db: DbClient = prisma) {
  return db.treasuryAccount.findFirst({
    where: { type: "cash", isActive: true },
  });
}

export function findDefaultCashAccountFull(db: DbClient = prisma) {
  return db.treasuryAccount.findFirst({
    where: { isDefault: true, isActive: true },
  });
}

export function findBankAccount(db: DbClient = prisma) {
  return db.treasuryAccount.findFirst({
    where: { code: "ACC-BANQUE", isActive: true },
    select: { id: true },
  });
}

/**
 * Résout la session de caisse et le compte de trésorerie associés à un mode de règlement.
 * - cash : session ouverte + compte caisse par défaut
 * - transfer / check / cib : compte banque ACC-BANQUE
 */
export async function resolvePaymentAccounting(
  method: string,
  tx: TxClient
): Promise<{ sessionId: number | null; accountId: number | null }> {
  let sessionId: number | null = null;
  let accountId: number | null = null;

  if (method === "cash") {
    const activeSession = await findOpenCashSessionId(tx);
    if (activeSession) {
      sessionId = activeSession.id;
    }
    const defaultCaisse = await findDefaultCashAccount(tx);
    if (defaultCaisse) {
      accountId = defaultCaisse.id;
    }
  } else if (method === "transfer" || method === "check" || method === "cib") {
    const bankAcc = await findBankAccount(tx);
    if (bankAcc) {
      accountId = bankAcc.id;
    }
  }

  return { sessionId, accountId };
}

export function findExistingRefundExpense(
  tx: TxClient,
  receiptNumber: string,
  amount: number
) {
  return tx.expense.findFirst({
    where: {
      receiptNumber,
      type: "expense",
      amount,
    },
  });
}

export function createExpenseRecord(
  tx: TxClient,
  data: {
    reference: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    method: string;
    beneficiary?: string | null;
    receiptNumber?: string | null;
    notes?: string | null;
    date?: Date;
    sessionId?: number | null;
    accountId?: number | null;
  }
) {
  return tx.expense.create({ data });
}

export function updateSessionCashIn(tx: TxClient, sessionId: number, amount: number) {
  return tx.cashSession.update({
    where: { id: sessionId },
    data: { totalCashIn: { increment: amount } },
  });
}

export function updateSessionCashOut(tx: TxClient, sessionId: number, amount: number) {
  return tx.cashSession.update({
    where: { id: sessionId },
    data: { totalCashOut: { increment: amount } },
  });
}
