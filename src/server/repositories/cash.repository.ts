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

// ─── CALCUL PRÉCIS DES SOLDES DE TRÉSORERIE ───────────────────────────────────

export async function calculateAccountBalance(
  accountId: number,
  txClient?: TxClient
): Promise<number> {
  const db: DbClient = txClient || prisma;
  const account = await db.treasuryAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return 0;

  // Pour le compte de caisse journalière physique (type "cash" ou isDefault),
  // le solde réel dépend de la session active ou de la dernière clôture enregistrée.
  if (account.isDefault || account.type === "cash") {
    const activeSession = await db.cashSession.findFirst({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
    });
    const latestClosedSession = await db.cashSession.findFirst({
      where: { status: "closed" },
      orderBy: { closedAt: "desc" },
    });

    if (activeSession) {
      const cutoff = latestClosedSession?.closedAt ?? account.openingDate ?? new Date(0);
      let bal = activeSession.openingAmount;

      const [trIn, trOut, payIn, advIn, incIn, suppOut, expOut] = await Promise.all([
        db.treasuryTransfer.aggregate({
          where: {
            toAccountId: accountId,
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { date: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        }),
        db.treasuryTransfer.aggregate({
          where: {
            fromAccountId: accountId,
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { date: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            purchaseId: null,
            supplierId: null,
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { paymentDate: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
        db.customerAdvance.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { paymentDate: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: {
            status: { not: "cancelled" },
            type: "income",
            method: "cash",
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { date: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { paymentDate: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
            AND: [
              { OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }] },
              { OR: [{ accountId: accountId }, { accountId: null }] },
            ],
          },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: {
            status: { not: "cancelled" },
            type: "expense",
            method: "cash",
            OR: [
              { sessionId: activeSession.id },
              {
                sessionId: null,
                OR: [
                  { date: { gt: cutoff } },
                  { createdAt: { gt: cutoff } },
                ],
              },
            ],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
      ]);

      bal += (trIn._sum.amount ?? 0) - (trOut._sum.amount ?? 0);
      bal += (payIn._sum.amount ?? 0) + (advIn._sum.amount ?? 0) + (incIn._sum.amount ?? 0);
      bal -= (suppOut._sum.amount ?? 0) + (expOut._sum.amount ?? 0);

      // Versements supplémentaires fournisseur
      try {
        const [suppAddOut, suppAddRevIn] = await Promise.all([
          db.supplierAdditionalPayment.aggregate({
            where: {
              treasuryAccountId: accountId,
              isReversal: false,
              OR: [
                { sessionId: activeSession.id },
                {
                  sessionId: null,
                  OR: [
                    { date: { gt: cutoff } },
                    { createdAt: { gt: cutoff } },
                  ],
                },
              ],
            },
            _sum: { amount: true },
          }),
          db.supplierAdditionalPayment.aggregate({
            where: {
              treasuryAccountId: accountId,
              isReversal: true,
              status: "completed",
              OR: [
                { sessionId: activeSession.id },
                {
                  sessionId: null,
                  OR: [
                    { date: { gt: cutoff } },
                    { createdAt: { gt: cutoff } },
                  ],
                },
              ],
            },
            _sum: { amount: true },
          }),
        ]);
        bal -= (suppAddOut._sum.amount ?? 0);
        bal += (suppAddRevIn._sum.amount ?? 0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("no such table")) throw err;
      }
      return Math.round(bal * 100) / 100;
    } else if (latestClosedSession && latestClosedSession.closedAt) {
      let bal = latestClosedSession.retainedAmount ?? latestClosedSession.closingAmount ?? 0;
      const closedAt = latestClosedSession.closedAt;

      const [trIn, trOut, payIn, advIn, incIn, suppOut, expOut] = await Promise.all([
        db.treasuryTransfer.aggregate({
          where: {
            toAccountId: accountId,
            sessionId: null,
            OR: [{ date: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
          },
          _sum: { amount: true },
        }),
        db.treasuryTransfer.aggregate({
          where: {
            fromAccountId: accountId,
            sessionId: null,
            OR: [{ date: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            purchaseId: null,
            supplierId: null,
            sessionId: null,
            OR: [{ paymentDate: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
        db.customerAdvance.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            sessionId: null,
            OR: [{ paymentDate: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: {
            status: { not: "cancelled" },
            type: "income",
            method: "cash",
            sessionId: null,
            OR: [{ date: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            sessionId: null,
            OR: [{ paymentDate: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            AND: [
              { OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }] },
              { OR: [{ accountId: accountId }, { accountId: null }] },
            ],
          },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: {
            status: { not: "cancelled" },
            type: "expense",
            method: "cash",
            sessionId: null,
            OR: [{ date: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            AND: [{ OR: [{ accountId: accountId }, { accountId: null }] }],
          },
          _sum: { amount: true },
        }),
      ]);

      bal += (trIn._sum.amount ?? 0) - (trOut._sum.amount ?? 0);
      bal += (payIn._sum.amount ?? 0) + (advIn._sum.amount ?? 0) + (incIn._sum.amount ?? 0);
      bal -= (suppOut._sum.amount ?? 0) + (expOut._sum.amount ?? 0);

      // Versements supplémentaires après clôture
      try {
        const [suppAddOut, suppAddRevIn] = await Promise.all([
          db.supplierAdditionalPayment.aggregate({
            where: {
              treasuryAccountId: accountId,
              isReversal: false,
              sessionId: null,
              OR: [{ date: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            },
            _sum: { amount: true },
          }),
          db.supplierAdditionalPayment.aggregate({
            where: {
              treasuryAccountId: accountId,
              isReversal: true,
              status: "completed",
              sessionId: null,
              OR: [{ date: { gt: closedAt } }, { createdAt: { gt: closedAt } }],
            },
            _sum: { amount: true },
          }),
        ]);
        bal -= (suppAddOut._sum.amount ?? 0);
        bal += (suppAddRevIn._sum.amount ?? 0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("no such table")) throw err;
      }
      return Math.round(bal * 100) / 100;
    }
  }

  // 1. Solde initial standard
  let balance = account.openingBalance;

  // 2 à 8 : Exécution parallèle optimisée des flux de trésorerie
  const [
    transfersIn,
    transfersOut,
    salePaymentsIn,
    advancesIn,
    incomes,
    supplierPaymentsOut,
    expensesOut,
  ] = await Promise.all([
    db.treasuryTransfer.aggregate({
      where: { toAccountId: accountId },
      _sum: { amount: true },
    }),
    db.treasuryTransfer.aggregate({
      where: { fromAccountId: accountId },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        status: { not: "cancelled" },
        purchaseId: null,
        supplierId: null,
        OR: [
          { accountId: accountId },
          ...(account.isDefault
            ? [{ accountId: null, method: "cash" }]
            : []),
        ],
      },
      _sum: { amount: true },
    }),
    db.customerAdvance.aggregate({
      where: {
        status: { not: "cancelled" },
        OR: [
          { accountId: accountId },
          ...(account.isDefault
            ? [{ accountId: null, method: "cash" }]
            : []),
        ],
      },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: {
        status: { not: "cancelled" },
        type: "income",
        OR: [
          { accountId: accountId },
          ...(account.isDefault
            ? [{ accountId: null, method: "cash" }]
            : []),
        ],
      },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        status: { not: "cancelled" },
        AND: [
          {
            OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }],
          },
          {
            OR: [
              { accountId: accountId },
              ...(account.isDefault
                ? [{ accountId: null, method: "cash" }]
                : []),
            ],
          },
        ],
      },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: {
        status: { not: "cancelled" },
        type: "expense",
        OR: [
          { accountId: accountId },
          ...(account.isDefault
            ? [{ accountId: null, method: "cash" }]
            : account.code === "ACC-BANQUE"
            ? [{ accountId: null, method: "transfer" }]
            : []),
        ],
      },
      _sum: { amount: true },
    }),
  ]);

  balance += (transfersIn._sum.amount ?? 0) - (transfersOut._sum.amount ?? 0);
  balance += (salePaymentsIn._sum.amount ?? 0) + (advancesIn._sum.amount ?? 0) + (incomes._sum.amount ?? 0);
  balance -= (supplierPaymentsOut._sum.amount ?? 0) + (expensesOut._sum.amount ?? 0);

  // Versements supplémentaires fournisseur (comptes généraux)
  try {
    const [suppAddOut, suppAddRevIn] = await Promise.all([
      db.supplierAdditionalPayment.aggregate({
        where: {
          treasuryAccountId: accountId,
          isReversal: false,
        },
        _sum: { amount: true },
      }),
      db.supplierAdditionalPayment.aggregate({
        where: {
          treasuryAccountId: accountId,
          isReversal: true,
          status: "completed",
        },
        _sum: { amount: true },
      }),
    ]);
    balance -= (suppAddOut._sum.amount ?? 0);
    balance += (suppAddRevIn._sum.amount ?? 0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no such table")) throw err;
  }

  return Math.round(balance * 100) / 100;
}

// ─── REQUÊTES DU MODULE CAISSE ───────────────────────────────────────────────

export async function generateNextCashSessionReference(txClient?: TxClient): Promise<string> {
  const db: DbClient = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CS-${yearMonth}-`;

  const last = await db.cashSession.findFirst({
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

export async function findDailyCaisseAccount(db: DbClient = prisma) {
  return (
    (await db.treasuryAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await db.treasuryAccount.findFirst({ where: { type: "cash", isActive: true } }))
  );
}

export async function findDailyCaisseAccountLenient(db: DbClient = prisma) {
  return (
    (await db.treasuryAccount.findFirst({ where: { isDefault: true } })) ||
    (await db.treasuryAccount.findFirst({ where: { type: "cash" } }))
  );
}

export async function findDailyCaisseAccountWithInactive(db: DbClient = prisma) {
  return (
    (await db.treasuryAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await db.treasuryAccount.findFirst({ where: { type: "cash", isActive: true } })) ||
    (await db.treasuryAccount.findFirst({ where: { type: "cash" } }))
  );
}

export function findTreasuryAccountById(id: number, db: DbClient = prisma) {
  return db.treasuryAccount.findUnique({ where: { id } });
}

export function findDefaultTreasuryAccountRaw(db: DbClient = prisma) {
  return db.treasuryAccount.findFirst({ where: { isDefault: true } });
}

export function findBankAccountRaw(db: DbClient = prisma) {
  return db.treasuryAccount.findFirst({ where: { code: "ACC-BANQUE" } });
}

export function createDefaultCashAccount(
  tx: TxClient,
  data: {
    code: string;
    name: string;
    type: string;
    openingBalance: number;
    isDefault: boolean;
    isActive: boolean;
  }
) {
  return tx.treasuryAccount.create({ data });
}

export function findCashSessionById(id: number, db: DbClient = prisma) {
  return db.cashSession.findUnique({ where: { id } });
}

export function findCashSessionWithTransfers(id: number, db: DbClient = prisma) {
  return db.cashSession.findUnique({
    where: { id },
    include: { transfers: true },
  });
}

export function findLastClosedSession(opts?: { before?: Date }, db: DbClient = prisma) {
  return db.cashSession.findFirst({
    where: {
      status: "closed",
      ...(opts?.before ? { closedAt: { lt: opts.before } } : {}),
    },
    orderBy: { closedAt: "desc" },
  });
}

export function findSessionsWithTransfers(db: DbClient = prisma) {
  return db.cashSession.findMany({
    orderBy: { openedAt: "desc" },
    include: {
      transfers: {
        include: {
          toAccount: { select: { id: true, name: true, code: true } },
          fromAccount: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });
}

export function findSessionsOfDay(dayStart: Date, dayEnd: Date, db: DbClient = prisma) {
  return db.cashSession.findMany({
    where: {
      OR: [
        { openedAt: { gte: dayStart, lte: dayEnd } },
        { createdAt: { gte: dayStart, lte: dayEnd } },
      ],
    },
    orderBy: { openedAt: "asc" },
  });
}

export function findAllSessionsLite(db: DbClient = prisma) {
  return db.cashSession.findMany({
    select: { id: true, openedAt: true, createdAt: true },
  });
}

export function findPriorClosedSessionBefore(before: Date, db: DbClient = prisma) {
  return db.cashSession.findFirst({
    where: {
      status: "closed",
      closedAt: { lt: before },
    },
    orderBy: { closedAt: "desc" },
  });
}

export function createCashSessionRecord(
  tx: TxClient,
  data: {
    reference: string;
    status: string;
    openingAmount: number;
    openedAt: Date;
    openingNotes: string | null;
  }
) {
  return tx.cashSession.create({ data });
}

export function updateCashSessionRecord(
  tx: TxClient,
  id: number,
  data: Record<string, unknown>
) {
  return tx.cashSession.update({ where: { id }, data });
}

// ─── ESPÈCES HORS SESSION (OUVERTURE & RÉCONCILIATION) ──────────────────────

export function findPendingCashPayments(cutoff: Date, caisseId: number | undefined, db: DbClient = prisma) {
  return db.payment.findMany({
    where: {
      sessionId: null,
      method: "cash",
      status: { not: "cancelled" },
      OR: [{ paymentDate: { gt: cutoff } }, { createdAt: { gt: cutoff } }],
      AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
    },
    select: { paymentDate: true },
  });
}

export function findPendingCashExpenses(cutoff: Date, caisseId: number | undefined, db: DbClient = prisma) {
  return db.expense.findMany({
    where: {
      sessionId: null,
      method: "cash",
      status: { not: "cancelled" },
      OR: [{ date: { gt: cutoff } }, { createdAt: { gt: cutoff } }],
      AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
    },
    select: { date: true },
  });
}

export function findUnlinkedCashPayments(cutoff: Date, caisseId: number | undefined, db: DbClient = prisma) {
  return db.payment.findMany({
    where: {
      sessionId: null,
      method: "cash",
      status: { not: "cancelled" },
      OR: [{ paymentDate: { gt: cutoff } }, { createdAt: { gt: cutoff } }],
      AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
    },
    select: { id: true, amount: true, paymentDate: true },
  });
}

export function findUnlinkedCashExpenses(cutoff: Date, caisseId: number | undefined, db: DbClient = prisma) {
  return db.expense.findMany({
    where: {
      sessionId: null,
      method: "cash",
      status: { not: "cancelled" },
      OR: [{ date: { gt: cutoff } }, { createdAt: { gt: cutoff } }],
      AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
    },
    select: { id: true, amount: true, type: true, date: true },
  });
}

export async function attachPendingCashToSession(
  tx: TxClient,
  sessionId: number,
  caisseId: number | undefined,
  cutoff: Date
) {
  await tx.payment.updateMany({
    where: {
      sessionId: null,
      method: "cash",
      status: { not: "cancelled" },
      OR: [{ paymentDate: { gt: cutoff } }, { createdAt: { gt: cutoff } }],
      AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
    },
    data: { sessionId },
  });
  await tx.expense.updateMany({
    where: {
      sessionId: null,
      method: "cash",
      OR: [{ date: { gt: cutoff } }, { createdAt: { gt: cutoff } }],
      AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
    },
    data: { sessionId },
  });
}

export function attachPaymentsToSession(tx: TxClient, ids: number[], sessionId: number) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return tx.payment.updateMany({ where: { id: { in: ids } }, data: { sessionId } });
}

export function attachAdvancesToSession(tx: TxClient, ids: number[], sessionId: number) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return tx.customerAdvance.updateMany({ where: { id: { in: ids } }, data: { sessionId } });
}

export function attachExpensesToSession(tx: TxClient, ids: number[], sessionId: number) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return tx.expense.updateMany({ where: { id: { in: ids } }, data: { sessionId } });
}

export function attachTransfersToSession(tx: TxClient, ids: number[], sessionId: number) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return tx.treasuryTransfer.updateMany({ where: { id: { in: ids } }, data: { sessionId } });
}

// ─── FENÊTRES DE SESSION (CLÔTURE) ───────────────────────────────────────────

export function findSessionWindowCashSales(
  sessionId: number,
  caisseId: number | undefined,
  cutoff: Date,
  until: Date,
  db: DbClient = prisma
) {
  return db.payment.findMany({
    where: {
      status: { not: "cancelled" },
      method: "cash",
      purchaseId: null,
      supplierId: null,
      AND: [
        { OR: [{ accountId: caisseId }, { accountId: null }] },
        {
          OR: [
            { sessionId },
            {
              sessionId: null,
              OR: [
                { paymentDate: { gt: cutoff, lte: until } },
                { createdAt: { gt: cutoff, lte: until } },
              ],
            },
          ],
        },
      ],
    },
    select: { id: true, amount: true },
  });
}

export function findSessionWindowCashSupplierPayments(
  sessionId: number,
  caisseId: number | undefined,
  cutoff: Date,
  until: Date,
  db: DbClient = prisma
) {
  return db.payment.findMany({
    where: {
      status: { not: "cancelled" },
      method: "cash",
      AND: [
        { OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }] },
        { OR: [{ accountId: caisseId }, { accountId: null }] },
        {
          OR: [
            { sessionId },
            {
              sessionId: null,
              OR: [
                { paymentDate: { gt: cutoff, lte: until } },
                { createdAt: { gt: cutoff, lte: until } },
              ],
            },
          ],
        },
      ],
    },
    select: { id: true, amount: true },
  });
}

export function findSessionWindowCashAdvances(
  sessionId: number,
  caisseId: number | undefined,
  cutoff: Date,
  until: Date,
  db: DbClient = prisma
) {
  return db.customerAdvance.findMany({
    where: {
      status: { not: "cancelled" },
      method: "cash",
      AND: [
        { OR: [{ accountId: caisseId }, { accountId: null }] },
        {
          OR: [
            { sessionId },
            {
              sessionId: null,
              OR: [
                { paymentDate: { gt: cutoff, lte: until } },
                { createdAt: { gt: cutoff, lte: until } },
              ],
            },
          ],
        },
      ],
    },
    select: { id: true, amount: true },
  });
}

export function findSessionWindowCashExpenses(
  sessionId: number,
  caisseId: number | undefined,
  cutoff: Date,
  until: Date,
  db: DbClient = prisma
) {
  return db.expense.findMany({
    where: {
      method: "cash",
      status: { not: "cancelled" },
      AND: [
        { OR: [{ accountId: caisseId }, { accountId: null }] },
        {
          OR: [
            { sessionId },
            {
              sessionId: null,
              OR: [
                { date: { gt: cutoff, lte: until } },
                { createdAt: { gt: cutoff, lte: until } },
              ],
            },
          ],
        },
      ],
    },
    select: { id: true, amount: true, type: true },
  });
}

export function findSessionWindowTransfers(
  sessionId: number,
  caisseId: number,
  cutoff: Date,
  until: Date,
  direction: "in" | "out",
  db: DbClient = prisma
) {
  const where =
    direction === "in"
      ? { toAccountId: caisseId }
      : { fromAccountId: caisseId };
  return db.treasuryTransfer.findMany({
    where: {
      ...where,
      OR: [
        { sessionId },
        {
          sessionId: null,
          OR: [
            { date: { gt: cutoff, lte: until } },
            { createdAt: { gt: cutoff, lte: until } },
          ],
        },
      ],
    },
    select: { id: true, amount: true },
  });
}

// ─── DÉPENSES ────────────────────────────────────────────────────────────────

export function findExpenseWithSession(id: number, db: DbClient = prisma) {
  return db.expense.findUnique({
    where: { id },
    include: { session: true },
  });
}

export function createExpenseEntry(
  data: {
    reference: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    method: string;
    beneficiary: string | null;
    receiptNumber: string | null;
    notes: string | null;
    date: Date;
    sessionId: number | null;
    accountId: number | null;
  },
  db: DbClient = prisma
) {
  return db.expense.create({ data });
}

export function cancelExpenseRecord(
  id: number,
  data: {
    status: string;
    cancelledAt: Date;
    cancellationReason: string;
    cancelledBy: string;
    notes: string;
  },
  db: DbClient = prisma
) {
  return db.expense.update({ where: { id }, data });
}

// ─── GRAND LIVRE / TABLEAU DE BORD ───────────────────────────────────────────

export function findLedgerPayments(db: DbClient = prisma) {
  return db.payment.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      sale: { include: { customer: true } },
      purchase: { include: { supplier: true } },
      supplier: true,
      account: { select: { id: true, name: true, code: true } },
      session: { select: { id: true, reference: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
}

export function findLedgerExpenses(db: DbClient = prisma) {
  return db.expense.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      account: { select: { id: true, name: true, code: true } },
      session: { select: { id: true, reference: true } },
    },
    orderBy: { date: "desc" },
  });
}

export function findLedgerTransfers(db: DbClient = prisma) {
  return db.treasuryTransfer.findMany({
    include: {
      fromAccount: { select: { id: true, name: true, code: true, type: true } },
      toAccount: { select: { id: true, name: true, code: true, type: true } },
      session: { select: { id: true, reference: true } },
    },
    orderBy: { date: "desc" },
  });
}

export function findLedgerAdvances(db: DbClient = prisma) {
  return db.customerAdvance.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      customer: { select: { name: true } },
      account: { select: { id: true, name: true, code: true } },
      session: { select: { id: true, reference: true } },
    },
    orderBy: { paymentDate: "desc" },
  });
}

export function findSuppAdditionalPaymentsWithLedger(db: DbClient = prisma) {
  return db.supplierAdditionalPayment.findMany({
    include: {
      supplier: { select: { name: true } },
      treasuryAccount: { select: { id: true, name: true, type: true, isDefault: true } },
      session: { select: { reference: true } },
      reversalOf: { select: { reference: true } },
    },
  });
}

export function findSuppAdditionalPaymentsForAccount(caisseId: number, db: DbClient = prisma) {
  return db.supplierAdditionalPayment.findMany({
    where: { treasuryAccountId: caisseId },
    include: {
      supplier: { select: { name: true } },
      reversalOf: { select: { reference: true } },
    },
  });
}

export function findShopSettingsById(db: DbClient = prisma) {
  return db.shopSettings.findUnique({ where: { id: 1 } });
}

// ─── JOURNAL JOURNALIER ──────────────────────────────────────────────────────

export async function findOpeningBalanceAggregates(
  caisseId: number,
  cutoff: Date,
  dayStart: Date,
  db: DbClient = prisma
) {
  return Promise.all([
    db.treasuryTransfer.aggregate({
      where: { toAccountId: caisseId, date: { gt: cutoff, lt: dayStart } },
      _sum: { amount: true },
    }),
    db.treasuryTransfer.aggregate({
      where: { fromAccountId: caisseId, date: { gt: cutoff, lt: dayStart } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        purchaseId: null,
        supplierId: null,
        OR: [{ accountId: caisseId }, { accountId: null }],
        paymentDate: { gt: cutoff, lt: dayStart },
      },
      _sum: { amount: true },
    }),
    db.customerAdvance.aggregate({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        OR: [{ accountId: caisseId }, { accountId: null }],
        paymentDate: { gt: cutoff, lt: dayStart },
      },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: {
        status: { not: "cancelled" },
        type: "income",
        method: "cash",
        OR: [{ accountId: caisseId }, { accountId: null }],
        date: { gt: cutoff, lt: dayStart },
      },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }],
        AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
        paymentDate: { gt: cutoff, lt: dayStart },
      },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: {
        status: { not: "cancelled" },
        type: "expense",
        method: "cash",
        OR: [{ accountId: caisseId }, { accountId: null }],
        date: { gt: cutoff, lt: dayStart },
      },
      _sum: { amount: true },
    }),
  ]);
}

export function fetchDailyCashFlux(caisseId: number, db: DbClient = prisma) {
  return Promise.all([
    db.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        purchaseId: null,
        supplierId: null,
        OR: [{ accountId: caisseId }, { accountId: null }],
      },
      include: { sale: { include: { customer: true } } },
    }),
    db.customerAdvance.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        OR: [{ accountId: caisseId }, { accountId: null }],
      },
      include: { customer: true },
    }),
    db.expense.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        OR: [{ accountId: caisseId }, { accountId: null }],
      },
    }),
    db.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        AND: [
          { OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }] },
          { OR: [{ accountId: caisseId }, { accountId: null }] },
        ],
      },
      include: { purchase: { include: { supplier: true } }, supplier: true },
    }),
    db.treasuryTransfer.findMany({
      where: {
        OR: [{ fromAccountId: caisseId }, { toAccountId: caisseId }],
      },
      include: { fromAccount: true, toAccount: true },
    }),
    db.cashSession.findMany({
      select: { id: true, openedAt: true, createdAt: true },
    }),
  ]);
}

// ─── TRANSFERTS DE TRÉSORERIE (CRUD UTILISÉS PAR LA CLÔTURE) ─────────────────

export function findTreasuryTransferById(id: number, db: DbClient = prisma) {
  return db.treasuryTransfer.findUnique({ where: { id } });
}

export function createTreasuryTransferRecord(
  tx: TxClient,
  data: {
    reference: string;
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    motif: string;
    date: Date;
    sessionId: number | null;
  }
) {
  return tx.treasuryTransfer.create({ data });
}

export function updateTreasuryTransferRecord(
  tx: TxClient,
  id: number,
  data: { amount: number; toAccountId: number; motif: string }
) {
  return tx.treasuryTransfer.update({ where: { id }, data });
}

export function deleteTreasuryTransferRecord(tx: TxClient, id: number) {
  return tx.treasuryTransfer.delete({ where: { id } });
}
