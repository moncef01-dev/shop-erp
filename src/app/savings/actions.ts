"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/formatters";
import { assertPeriodNotLocked } from "@/lib/period-lock";
import { generateNextExpenseReference } from "@/app/cash/actions";
import type { ShopSettingsData } from "@/app/settings/actions";

export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type SavingsActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Revalidation outside HTTP context (e.g. testing) is safely ignored
  }
}

// ─── GÉNÉRATEUR DE RÉFÉRENCE UNIQUE D'ÉPARGNE (SAV-YYYYMM-XXXX) ───────────────

export async function generateNextSavingsReference(
  type: "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL" = "DEPOSIT",
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
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

// ─── RÉCUPÉRATION GLOBALE DES DONNÉES DU MODULE ÉPARGNE CLIENT ─────────────────

export interface CustomerSavingsAccountSummary {
  id: number;
  customerId: number;
  customerName: string;
  customerCode: string | null;
  customerPhone: string | null;
  customerPhone2: string | null;
  balance: number;
  totalDeposited: number;
  totalUsed: number;
  totalRefunded: number;
  updatedAt: string;
  transactionCount: number;
}

export interface CustomerSavingsTransactionView {
  id: number;
  reference: string;
  customerId: number;
  customerName: string;
  type: "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL";
  amount: number;
  direction: "IN" | "OUT";
  balanceBefore: number;
  balanceAfter: number;
  paymentMethod: string;
  saleId: number | null;
  saleReference: string | null;
  relatedTransactionId: number | null;
  sessionId: number | null;
  sessionReference: string | null;
  description: string;
  notes: string | null;
  status: string;
  date: string;
  createdAt: string;
}

export async function getSavingsOverviewData() {
  const [accounts, recentTransactions, customers, activeSession, settings] = await Promise.all([
    prisma.customerSavingsAccount.findMany({
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
    prisma.customerSavingsTransaction.findMany({
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
    prisma.customer.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, phone: true, phone2: true },
      orderBy: { name: "asc" },
    }),
    prisma.cashSession.findFirst({
      where: { status: "open" },
      select: { id: true, reference: true },
    }),
    prisma.shopSettings.findFirst({
      where: { id: 1 },
    }) as Promise<ShopSettingsData | null>,
  ]);

  const totalAvailableSavings = roundMoney(
    accounts.reduce((sum, a) => sum + (a.balance || 0), 0)
  );
  const totalDeposited = roundMoney(
    accounts.reduce((sum, a) => sum + (a.totalDeposited || 0), 0)
  );
  const totalUsed = roundMoney(
    accounts.reduce((sum, a) => sum + (a.totalUsed || 0), 0)
  );
  const totalRefunded = roundMoney(
    accounts.reduce((sum, a) => sum + (a.totalRefunded || 0), 0)
  );

  const formattedAccounts: CustomerSavingsAccountSummary[] = accounts.map((a) => ({
    id: a.id,
    customerId: a.customerId,
    customerName: a.customer.name,
    customerCode: a.customer.code,
    customerPhone: a.customer.phone,
    customerPhone2: a.customer.phone2,
    balance: a.balance,
    totalDeposited: a.totalDeposited,
    totalUsed: a.totalUsed,
    totalRefunded: a.totalRefunded,
    updatedAt: a.updatedAt.toISOString(),
    transactionCount: a._count.transactions,
  }));

  const formattedTransactions: CustomerSavingsTransactionView[] = recentTransactions.map((tx) => ({
    id: tx.id,
    reference: tx.reference,
    customerId: tx.customerId,
    customerName: tx.customer.name,
    type: tx.type as "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL",
    amount: tx.amount,
    direction: tx.direction as "IN" | "OUT",
    balanceBefore: tx.balanceBefore,
    balanceAfter: tx.balanceAfter,
    paymentMethod: tx.paymentMethod,
    saleId: tx.saleId,
    saleReference: tx.sale?.reference || null,
    relatedTransactionId: tx.relatedTransactionId,
    sessionId: tx.sessionId,
    sessionReference: tx.session?.reference || null,
    description: tx.description,
    notes: tx.notes,
    status: tx.status,
    date: tx.date.toISOString(),
    createdAt: tx.createdAt.toISOString(),
  }));

  return {
    metrics: {
      totalAvailableSavings,
      totalDeposited,
      totalUsed,
      totalRefunded,
      activeAccountsCount: accounts.filter((a) => a.balance > 0).length,
      totalAccountsCount: accounts.length,
    },
    accounts: formattedAccounts,
    recentTransactions: formattedTransactions,
    customers,
    activeCashSession: activeSession ? { id: activeSession.id, reference: activeSession.reference } : null,
    settings,
  };
}

// ─── DÉTAIL D'UN COMPTE D'ÉPARGNE CLIENT ───────────────────────────────────────

export async function getCustomerSavingsDetailsAction(customerId: number) {
  const id = Number(customerId);
  if (!id || isNaN(id)) return null;

  const [customer, account, transactions, unpaidSales] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, phone: true, phone2: true, address: true },
    }),
    prisma.customerSavingsAccount.findUnique({
      where: { customerId: id },
    }),
    prisma.customerSavingsTransaction.findMany({
      where: { customerId: id },
      include: {
        sale: { select: { id: true, reference: true, totalAmount: true, paidAmount: true } },
        session: { select: { id: true, reference: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    prisma.sales.findMany({
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

  if (!customer) return null;

  return {
    customer,
    account: account
      ? {
          id: account.id,
          balance: account.balance,
          totalDeposited: account.totalDeposited,
          totalUsed: account.totalUsed,
          totalRefunded: account.totalRefunded,
          updatedAt: account.updatedAt.toISOString(),
        }
      : {
          id: 0,
          balance: 0,
          totalDeposited: 0,
          totalUsed: 0,
          totalRefunded: 0,
          updatedAt: new Date().toISOString(),
        },
    transactions: transactions.map((t) => ({
      id: t.id,
      reference: t.reference,
      type: t.type as "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL",
      amount: t.amount,
      direction: t.direction as "IN" | "OUT",
      balanceBefore: t.balanceBefore,
      balanceAfter: t.balanceAfter,
      paymentMethod: t.paymentMethod,
      saleId: t.saleId,
      saleReference: t.sale?.reference || null,
      relatedTransactionId: t.relatedTransactionId,
      sessionReference: t.session?.reference || null,
      description: t.description,
      notes: t.notes,
      date: t.date.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
    unpaidSales: unpaidSales.map((s) => ({
      id: s.id,
      reference: s.reference,
      totalAmount: s.totalAmount,
      paidAmount: s.paidAmount,
      remainingAmount: roundMoney(Math.max(0, s.totalAmount - s.paidAmount)),
      paymentStatus: s.paymentStatus,
      saleDate: s.saleDate.toISOString(),
    })),
  };
}

// ─── 1. ENREGISTRER UN DÉPÔT D'ÉPARGNE CLIENT ─────────────────────────────────

export interface RecordSavingsDepositInput {
  customerId: number;
  amount: number;
  paymentMethod?: string; // "cash", "cib", "check", "transfer"
  date?: string;
  notes?: string;
}

export async function recordSavingsDepositAction(
  input: RecordSavingsDepositInput
): Promise<SavingsActionResponse<{ transaction: CustomerSavingsTransactionView; receiptReference: string }>> {
  try {
    const customerId = Number(input.customerId);
    const amount = roundMoney(Number(input.amount));
    const paymentMethod = input.paymentMethod || "cash";
    const depositDate = input.date ? new Date(input.date) : new Date();
    const notes = input.notes?.trim() || null;

    if (!customerId || isNaN(customerId)) {
      return { success: false, error: "Veuillez sélectionner un client valide." };
    }

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant du dépôt doit être strictement supérieur à 0 DA." };
    }

    await assertPeriodNotLocked(depositDate, "Dépôt d'épargne client");

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, isActive: true },
    });
    if (!customer) {
      return { success: false, error: "Client introuvable." };
    }
    if (!customer.isActive) {
      return { success: false, error: "Impossible d'effectuer un dépôt pour un client désactivé." };
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Trouver ou initialiser le compte d'épargne du client
      let account = await tx.customerSavingsAccount.findUnique({
        where: { customerId },
      });
      if (!account) {
        account = await tx.customerSavingsAccount.create({
          data: {
            customerId,
            balance: 0,
            totalDeposited: 0,
            totalUsed: 0,
            totalRefunded: 0,
          },
        });
      }

      const balanceBefore = account.balance;
      const balanceAfter = roundMoney(balanceBefore + amount);
      const reference = await generateNextSavingsReference("DEPOSIT", tx);

      // 2. Gestion de la trésorerie et de la session de caisse
      let sessionId: number | null = null;
      let accountId: number | null = null;

      if (paymentMethod === "cash") {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: "open" },
          select: { id: true },
        });
        if (activeSession) {
          sessionId = activeSession.id;
        }

        const defaultCaisse = await tx.treasuryAccount.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        }) || await tx.treasuryAccount.findFirst({
          where: { type: "cash", isActive: true },
          select: { id: true },
        });
        if (defaultCaisse) {
          accountId = defaultCaisse.id;
        }

        // Créer l'encaissement de trésorerie (income)
        await tx.expense.create({
          data: {
            reference: `ENC-SAV-${reference.replace("SAV-", "")}`,
            type: "income",
            category: "misc_income",
            description: `Dépôt épargne client ${reference} (${customer.name})`,
            amount,
            method: "cash",
            beneficiary: customer.name,
            receiptNumber: reference,
            notes: notes ? `Dépôt épargne ${reference} : ${notes}` : `Dépôt sur compte d'épargne ${reference}`,
            date: depositDate,
            sessionId,
            accountId,
          },
        });

        // Mettre à jour la session active
        if (activeSession) {
          await tx.cashSession.update({
            where: { id: activeSession.id },
            data: {
              totalCashIn: { increment: amount },
            },
          });
        }
      } else {
        // Paiement non-espèces (Virement, Chèque, CIB)
        const bankAccount = await tx.treasuryAccount.findFirst({
          where: { code: "ACC-BANQUE", isActive: true },
          select: { id: true },
        }) || await tx.treasuryAccount.findFirst({
          where: { type: "bank", isActive: true },
          select: { id: true },
        });
        if (bankAccount) {
          accountId = bankAccount.id;
        }

        await tx.expense.create({
          data: {
            reference: `ENC-SAV-${reference.replace("SAV-", "")}`,
            type: "income",
            category: "misc_income",
            description: `Dépôt épargne client ${reference} (${customer.name}) [${paymentMethod.toUpperCase()}]`,
            amount,
            method: paymentMethod,
            beneficiary: customer.name,
            receiptNumber: reference,
            notes: notes ? `Dépôt épargne ${reference} : ${notes}` : `Dépôt épargne hors espèces`,
            date: depositDate,
            sessionId: null,
            accountId,
          },
        });
      }

      // 3. Enregistrer l'écriture au grand livre d'épargne
      const txRecord = await tx.customerSavingsTransaction.create({
        data: {
          reference,
          customerId,
          accountId: account.id,
          treasuryAccountId: accountId,
          type: "DEPOSIT",
          amount,
          direction: "IN",
          balanceBefore,
          balanceAfter,
          paymentMethod,
          sessionId,
          description: notes ? `Dépôt d'épargne — ${notes}` : "Dépôt d'épargne client",
          notes,
          date: depositDate,
        },
      });

      // 4. Mettre à jour le solde du compte d'épargne
      await tx.customerSavingsAccount.update({
        where: { id: account.id },
        data: {
          balance: balanceAfter,
          totalDeposited: roundMoney(account.totalDeposited + amount),
        },
      });

      return {
        txRecord,
        customerName: customer.name,
        reference,
        balanceBefore,
        balanceAfter,
      };
    });

    safeRevalidate("/savings");
    safeRevalidate("/customers");
    safeRevalidate("/cash");

    const formattedTx: CustomerSavingsTransactionView = {
      id: result.txRecord.id,
      reference: result.txRecord.reference,
      customerId,
      customerName: result.customerName,
      type: "DEPOSIT",
      amount,
      direction: "IN",
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      paymentMethod,
      saleId: null,
      saleReference: null,
      relatedTransactionId: null,
      sessionId: result.txRecord.sessionId,
      sessionReference: null,
      description: result.txRecord.description,
      notes: result.txRecord.notes,
      status: result.txRecord.status,
      date: result.txRecord.date.toISOString(),
      createdAt: result.txRecord.createdAt.toISOString(),
    };

    return {
      success: true,
      message: `Dépôt de ${amount.toLocaleString("fr-DZ")} DA enregistré avec succès (Réf: ${result.reference}). Nouveau solde disponible : ${result.balanceAfter.toLocaleString("fr-DZ")} DA.`,
      data: {
        transaction: formattedTx,
        receiptReference: result.reference,
      },
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement dépôt épargne:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement du dépôt d'épargne.";
    return { success: false, error: msg };
  }
}

// ─── 2. REMBOURSER UNE ÉPARGNE CLIENT INUTILISÉE ─────────────────────────────

export interface RecordSavingsRefundInput {
  customerId: number;
  amount: number;
  paymentMethod?: string; // "cash", "transfer", "check"
  date?: string;
  reason: string;
}

export async function recordSavingsRefundAction(
  input: RecordSavingsRefundInput
): Promise<SavingsActionResponse<{ transaction: CustomerSavingsTransactionView; receiptReference: string }>> {
  try {
    const customerId = Number(input.customerId);
    const refundAmount = roundMoney(Number(input.amount));
    const paymentMethod = input.paymentMethod || "cash";
    const refundDate = input.date ? new Date(input.date) : new Date();
    const reason = input.reason?.trim();

    if (!customerId || isNaN(customerId)) {
      return { success: false, error: "Veuillez sélectionner un client valide." };
    }

    if (isNaN(refundAmount) || refundAmount <= 0) {
      return { success: false, error: "Le montant à rembourser doit être strictement supérieur à 0 DA." };
    }

    if (!reason || reason.length < 3) {
      return { success: false, error: "Veuillez préciser le motif du remboursement (minimum 3 caractères)." };
    }

    await assertPeriodNotLocked(refundDate, "Remboursement d'épargne client");

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) {
      return { success: false, error: "Client introuvable." };
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Contrôle strict du compte et solde
      const account = await tx.customerSavingsAccount.findUnique({
        where: { customerId },
      });
      if (!account || account.balance <= 0) {
        throw new Error("Ce client ne dispose d'aucun solde d'épargne disponible à rembourser.");
      }

      if (refundAmount > account.balance) {
        throw new Error(
          `Le montant demandé (${refundAmount.toLocaleString("fr-DZ")} DA) excède le solde disponible (${account.balance.toLocaleString("fr-DZ")} DA).`
        );
      }

      // 2. Gestion de trésorerie / décaissement
      let sessionId: number | null = null;
      let accountId: number | null = null;

      if (paymentMethod === "cash") {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: "open" },
        });

        // Protection conformité trésorerie : le décaissement en espèces exige une session ouverte
        if (!activeSession) {
          throw new Error(
            "Impossible d'effectuer le remboursement en espèces : aucune session de caisse n'est actuellement ouverte. Veuillez ouvrir une session de caisse pour enregistrer le décaissement."
          );
        }

        sessionId = activeSession.id;

        const defaultCaisse = await tx.treasuryAccount.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        }) || await tx.treasuryAccount.findFirst({
          where: { type: "cash", isActive: true },
          select: { id: true },
        });
        if (defaultCaisse) {
          accountId = defaultCaisse.id;
        }

        const reference = await generateNextSavingsReference("REFUND", tx);

        // Émission du décaissement en trésorerie
        await tx.expense.create({
          data: {
            reference: `DEP-SAV-${reference.replace("SAV-", "")}`,
            type: "expense",
            category: "refund",
            description: `Remboursement épargne client ${reference} (${customer.name}) : ${reason}`,
            amount: refundAmount,
            method: "cash",
            beneficiary: customer.name,
            receiptNumber: reference,
            notes: `Remboursement d'épargne : ${reason}`,
            date: refundDate,
            sessionId,
            accountId,
          },
        });

        // Décrémenter le tiroir de caisse de la session active
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            totalCashOut: { increment: refundAmount },
          },
        });

        const balanceBefore = account.balance;
        const balanceAfter = roundMoney(balanceBefore - refundAmount);

        // 3. Écriture au grand livre d'épargne
        const txRecord = await tx.customerSavingsTransaction.create({
          data: {
            reference,
            customerId,
            accountId: account.id,
            treasuryAccountId: accountId,
            type: "REFUND",
            amount: refundAmount,
            direction: "OUT",
            balanceBefore,
            balanceAfter,
            paymentMethod,
            sessionId,
            description: `Remboursement épargne : ${reason}`,
            notes: reason,
            date: refundDate,
          },
        });

        // 4. Mise à jour du compte d'épargne
        await tx.customerSavingsAccount.update({
          where: { id: account.id },
          data: {
            balance: balanceAfter,
            totalRefunded: roundMoney(account.totalRefunded + refundAmount),
          },
        });

        return {
          txRecord,
          customerName: customer.name,
          reference,
          balanceBefore,
          balanceAfter,
        };
      } else {
        // Remboursement par banque (Virement / Chèque)
        const bankAccount = await tx.treasuryAccount.findFirst({
          where: { code: "ACC-BANQUE", isActive: true },
          select: { id: true },
        }) || await tx.treasuryAccount.findFirst({
          where: { type: "bank", isActive: true },
          select: { id: true },
        });
        if (bankAccount) {
          accountId = bankAccount.id;
        }

        const reference = await generateNextSavingsReference("REFUND", tx);

        await tx.expense.create({
          data: {
            reference: `DEP-SAV-${reference.replace("SAV-", "")}`,
            type: "expense",
            category: "refund",
            description: `Remboursement épargne client ${reference} (${customer.name}) [${paymentMethod.toUpperCase()}] : ${reason}`,
            amount: refundAmount,
            method: paymentMethod,
            beneficiary: customer.name,
            receiptNumber: reference,
            notes: `Remboursement épargne : ${reason}`,
            date: refundDate,
            sessionId: null,
            accountId,
          },
        });

        const balanceBefore = account.balance;
        const balanceAfter = roundMoney(balanceBefore - refundAmount);

        const txRecord = await tx.customerSavingsTransaction.create({
          data: {
            reference,
            customerId,
            accountId: account.id,
            treasuryAccountId: accountId,
            type: "REFUND",
            amount: refundAmount,
            direction: "OUT",
            balanceBefore,
            balanceAfter,
            paymentMethod,
            sessionId: null,
            description: `Remboursement épargne : ${reason}`,
            notes: reason,
            date: refundDate,
          },
        });

        await tx.customerSavingsAccount.update({
          where: { id: account.id },
          data: {
            balance: balanceAfter,
            totalRefunded: roundMoney(account.totalRefunded + refundAmount),
          },
        });

        return {
          txRecord,
          customerName: customer.name,
          reference,
          balanceBefore,
          balanceAfter,
        };
      }
    });

    safeRevalidate("/savings");
    safeRevalidate("/customers");
    safeRevalidate("/cash");

    const formattedTx: CustomerSavingsTransactionView = {
      id: result.txRecord.id,
      reference: result.txRecord.reference,
      customerId,
      customerName: result.customerName,
      type: "REFUND",
      amount: refundAmount,
      direction: "OUT",
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      paymentMethod,
      saleId: null,
      saleReference: null,
      relatedTransactionId: null,
      sessionId: result.txRecord.sessionId,
      sessionReference: null,
      description: result.txRecord.description,
      notes: result.txRecord.notes,
      status: result.txRecord.status,
      date: result.txRecord.date.toISOString(),
      createdAt: result.txRecord.createdAt.toISOString(),
    };

    return {
      success: true,
      message: `Remboursement de ${refundAmount.toLocaleString("fr-DZ")} DA validé (Réf: ${result.reference}). Solde d'épargne restant : ${result.balanceAfter.toLocaleString("fr-DZ")} DA.`,
      data: {
        transaction: formattedTx,
        receiptReference: result.reference,
      },
    };
  } catch (err: unknown) {
    console.error("Erreur remboursement épargne:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors du remboursement de l'épargne.";
    return { success: false, error: msg };
  }
}

// ─── 3. AFFECTER DE L'ÉPARGNE À UNE FACTURE EXISTANTE ───────────────────────

export interface AllocateSavingsToInvoiceInput {
  customerId: number;
  saleId: number;
  amount: number;
  notes?: string;
}

export async function allocateSavingsToInvoiceAction(
  input: AllocateSavingsToInvoiceInput
): Promise<SavingsActionResponse> {
  try {
    const customerId = Number(input.customerId);
    const saleId = Number(input.saleId);
    const requestedAmount = roundMoney(Number(input.amount));
    const notes = input.notes?.trim() || null;

    if (!customerId || !saleId || isNaN(requestedAmount) || requestedAmount <= 0) {
      return { success: false, error: "Paramètres d'affectation invalides." };
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Contrôle compte d'épargne
      const account = await tx.customerSavingsAccount.findUnique({
        where: { customerId },
        include: { customer: true },
      });
      if (!account || account.balance <= 0) {
        throw new Error("Ce client ne possède aucun solde d'épargne disponible.");
      }

      // 2. Contrôle facture
      const sale = await tx.sales.findUnique({
        where: { id: saleId },
        include: { customer: true },
      });
      if (!sale) {
        throw new Error("Facture de vente introuvable.");
      }
      if (sale.status === "cancelled") {
        throw new Error("Impossible d'affecter de l'épargne à une facture annulée.");
      }

      // Règle stricte anti-confusion
      if (sale.customerId && sale.customerId !== customerId) {
        throw new Error(
          `Cette épargne appartient au client "${account.customer.name}". Elle ne peut pas être affectée à une vente d'un autre client.`
        );
      }

      const remainingDue = roundMoney(Math.max(0, sale.totalAmount - sale.paidAmount));
      if (remainingDue <= 0) {
        throw new Error("Cette facture est déjà intégralement soldée.");
      }

      const maxApplicable = Math.min(account.balance, remainingDue);
      if (requestedAmount > maxApplicable) {
        throw new Error(
          `Le montant demandé (${requestedAmount.toLocaleString("fr-DZ")} DA) dépasse le solde d'épargne disponible (${account.balance.toLocaleString("fr-DZ")} DA) ou le reste dû (${remainingDue.toLocaleString("fr-DZ")} DA).`
        );
      }

      const reference = await generateNextSavingsReference("USAGE", tx);
      const balanceBefore = account.balance;
      const balanceAfter = roundMoney(balanceBefore - requestedAmount);

      // 3. Écriture au grand livre d'épargne (USAGE)
      await tx.customerSavingsTransaction.create({
        data: {
          reference,
          customerId,
          accountId: account.id,
          type: "USAGE",
          amount: requestedAmount,
          direction: "OUT",
          balanceBefore,
          balanceAfter,
          paymentMethod: "savings",
          saleId: sale.id,
          description: `Règlement facture ${sale.reference}`,
          notes: notes || `Déduction de ${requestedAmount.toLocaleString("fr-DZ")} DA d'épargne pour régler la facture ${sale.reference}`,
          date: new Date(),
        },
      });

      // 4. Mettre à jour le solde du compte d'épargne
      await tx.customerSavingsAccount.update({
        where: { id: account.id },
        data: {
          balance: balanceAfter,
          totalUsed: roundMoney(account.totalUsed + requestedAmount),
        },
      });

      // 5. Générer le règlement de facture Payment (SANS flux de trésorerie / caisse)
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const payPrefix = `PAY-${yearMonth}-`;
      const lastPay = await tx.payment.findFirst({
        where: { reference: { startsWith: payPrefix } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      let nextPaySeq = 1;
      if (lastPay?.reference) {
        const parts = lastPay.reference.split("-");
        const pNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(pNum)) nextPaySeq = pNum + 1;
      }
      const paymentRef = `${payPrefix}${String(nextPaySeq).padStart(4, "0")}`;

      await tx.payment.create({
        data: {
          reference: paymentRef,
          saleId: sale.id,
          amount: requestedAmount,
          method: "savings",
          status: "completed",
          notes: `Règlement par déduction d'épargne client (Réf: ${reference})`,
          paymentDate: now,
          sessionId: null, // ZÉRO flux physique de caisse
          accountId: null, // ZÉRO flux de trésorerie
        },
      });

      // 6. Mettre à jour la facture de vente
      const newPaid = roundMoney(sale.paidAmount + requestedAmount);
      const newStatus = newPaid >= sale.totalAmount ? "paid" : "partial";
      await tx.sales.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: newStatus,
        },
      });

      return {
        reference,
        saleReference: sale.reference,
        requestedAmount,
        newRemainingBalance: roundMoney(Math.max(0, sale.totalAmount - newPaid)),
        savingsBalanceAfter: balanceAfter,
      };
    });

    safeRevalidate("/savings");
    safeRevalidate("/sales");
    safeRevalidate("/customers");

    return {
      success: true,
      message: `${result.requestedAmount.toLocaleString("fr-DZ")} DA d'épargne (Réf: ${result.reference}) appliqués à la facture ${result.saleReference}. Reste dû facture : ${result.newRemainingBalance.toLocaleString("fr-DZ")} DA. Solde épargne restant : ${result.savingsBalanceAfter.toLocaleString("fr-DZ")} DA.`,
    };
  } catch (err: unknown) {
    console.error("Erreur affectation épargne:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'affectation de l'épargne.";
    return { success: false, error: msg };
  }
}

// ─── 4. RÉTROCESSION / ANNULATION DE DÉDUCTION SUITE À ANNULATION DE VENTE ────

export async function reverseSavingsDeductionsForSale(
  tx: PrismaTransactionClient,
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

// ─── 5. DONNÉES DU REÇU D'IMPRESSION (DÉPÔT / REMBOURSEMENT) ───────────────────

export interface PrintableSavingsReceiptData {
  transaction: CustomerSavingsTransactionView;
  customer: {
    id: number;
    code: string | null;
    name: string;
    phone: string | null;
    phone2: string | null;
    address: string | null;
  };
  settings: ShopSettingsData | null;
}

export async function getSavingsReceiptDataAction(
  transactionId: number
): Promise<PrintableSavingsReceiptData | null> {
  const txRecord = await prisma.customerSavingsTransaction.findUnique({
    where: { id: transactionId },
    include: {
      customer: true,
      sale: { select: { id: true, reference: true } },
      session: { select: { id: true, reference: true } },
    },
  });

  if (!txRecord) return null;

  const settings = (await prisma.shopSettings.findFirst({
    where: { id: 1 },
  })) as ShopSettingsData | null;

  return {
    transaction: {
      id: txRecord.id,
      reference: txRecord.reference,
      customerId: txRecord.customerId,
      customerName: txRecord.customer.name,
      type: txRecord.type as "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL",
      amount: txRecord.amount,
      direction: txRecord.direction as "IN" | "OUT",
      balanceBefore: txRecord.balanceBefore,
      balanceAfter: txRecord.balanceAfter,
      paymentMethod: txRecord.paymentMethod,
      saleId: txRecord.saleId,
      saleReference: txRecord.sale?.reference || null,
      relatedTransactionId: txRecord.relatedTransactionId,
      sessionId: txRecord.sessionId,
      sessionReference: txRecord.session?.reference || null,
      description: txRecord.description,
      notes: txRecord.notes,
      status: txRecord.status,
      date: txRecord.date.toISOString(),
      createdAt: txRecord.createdAt.toISOString(),
    },
    customer: {
      id: txRecord.customer.id,
      code: txRecord.customer.code,
      name: txRecord.customer.name,
      phone: txRecord.customer.phone,
      phone2: txRecord.customer.phone2,
      address: txRecord.customer.address,
    },
    settings,
  };
}

// ─── 6. DONNÉES DU RELEVÉ DE COMPTE ÉPARGNE CLIENT ────────────────────────────

export interface SavingsStatementEntry {
  id: number;
  date: string;
  reference: string;
  type: "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL";
  typeLabel: string;
  description: string;
  paymentMethod: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  docReference: string | null;
}

export interface PrintableSavingsStatementData {
  customer: {
    id: number;
    code: string | null;
    name: string;
    phone: string | null;
    phone2: string | null;
    address: string | null;
  };
  account: {
    balance: number;
    totalDeposited: number;
    totalUsed: number;
    totalRefunded: number;
  };
  startDate?: string;
  endDate?: string;
  entries: SavingsStatementEntry[];
  totalInflows: number;
  totalOutflows: number;
  currentBalance: number;
  settings: ShopSettingsData | null;
}

export async function getSavingsStatementDataAction(params: {
  customerId: number;
  startDate?: string;
  endDate?: string;
}): Promise<PrintableSavingsStatementData | null> {
  const { customerId, startDate, endDate } = params;
  const id = Number(customerId);
  if (!id || isNaN(id)) return null;

  const [customer, account, txs, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, phone: true, phone2: true, address: true },
    }),
    prisma.customerSavingsAccount.findUnique({
      where: { customerId: id },
    }),
    prisma.customerSavingsTransaction.findMany({
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
    prisma.shopSettings.findFirst({
      where: { id: 1 },
    }) as Promise<ShopSettingsData | null>,
  ]);

  if (!customer) return null;

  const typeLabels: Record<string, string> = {
    DEPOSIT: "Dépôt d'épargne",
    USAGE: "Utilisation sur facture",
    REFUND: "Remboursement d'épargne",
    REVERSAL: "Rétablissement suite annulation",
  };

  let totalIn = 0;
  let totalOut = 0;

  const entries: SavingsStatementEntry[] = txs.map((t) => {
    const isIncome = t.direction === "IN";
    const inflow = isIncome ? t.amount : 0;
    const outflow = isIncome ? 0 : t.amount;
    totalIn += inflow;
    totalOut += outflow;

    return {
      id: t.id,
      date: t.date.toISOString(),
      reference: t.reference,
      type: t.type as "DEPOSIT" | "USAGE" | "REFUND" | "REVERSAL",
      typeLabel: typeLabels[t.type] || t.type,
      description: t.description,
      paymentMethod: t.paymentMethod,
      inflow,
      outflow,
      runningBalance: t.balanceAfter,
      docReference: t.sale?.reference || null,
    };
  });

  return {
    customer,
    account: account
      ? {
          balance: account.balance,
          totalDeposited: account.totalDeposited,
          totalUsed: account.totalUsed,
          totalRefunded: account.totalRefunded,
        }
      : {
          balance: 0,
          totalDeposited: 0,
          totalUsed: 0,
          totalRefunded: 0,
        },
    startDate,
    endDate,
    entries,
    totalInflows: roundMoney(totalIn),
    totalOutflows: roundMoney(totalOut),
    currentBalance: account?.balance || 0,
    settings,
  };
}

