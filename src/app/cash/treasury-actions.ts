"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/inventory-transaction";

export interface TreasuryAccountData {
  id: number;
  code: string;
  name: string;
  type: "cash" | "safe" | "bank" | "other";
  openingBalance: number;
  openingDate: string;
  currentBalance: number;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  transfersInCount: number;
  transfersOutCount: number;
  totalTransfersIn: number;
  totalTransfersOut: number;
}

export interface TreasuryTransferData {
  id: number;
  reference: string;
  fromAccountId: number;
  fromAccountName: string;
  fromAccountCode: string;
  toAccountId: number;
  toAccountName: string;
  toAccountCode: string;
  amount: number;
  motif: string;
  notes: string | null;
  date: string;
  sessionId: number | null;
  sessionRef?: string | null;
  createdAt: string;
}

export interface AccountMovementItem {
  id: string;
  date: string;
  reference: string;
  type:
    | "OPENING"
    | "TRANSFER_IN"
    | "TRANSFER_OUT"
    | "SALE_PAYMENT"
    | "SUPPLIER_PAYMENT"
    | "EXPENSE"
    | "INCOME"
    | "CUSTOMER_ADVANCE";
  typeLabel: string;
  description: string;
  party: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  method?: string;
  docReference?: string | null;
}

export interface TreasuryDashboardSummary {
  accounts: TreasuryAccountData[];
  transfers: TreasuryTransferData[];
  totalTreasuryFunds: number;
  activeAccountsCount: number;
}

function safeRevalidate() {
  try {
    revalidatePath("/cash");
    revalidatePath("/suppliers");
    revalidatePath("/purchases");
    revalidatePath("/sales");
  } catch {
    // Silently ignore in testing / script context
  }
}

// ─── GÉNÉRATION DES RÉFÉRENCES ────────────────────────────────────────────────

export async function generateNextTreasuryTransferReference(
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `TRF-${yearMonth}-`;

  const last = await db.treasuryTransfer.findFirst({
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

export async function generateNextTreasuryAccountCode(
  type: string,
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const prefixMap: Record<string, string> = {
    cash: "ACC-CAISSE-",
    safe: "ACC-COFFRE-",
    bank: "ACC-BANQUE-",
    other: "ACC-DIV-",
  };
  const prefix = prefixMap[type] || "ACC-DIV-";

  const count = await db.treasuryAccount.count({
    where: { code: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(2, "0")}`;
}

// ─── CALCUL PRÉCIS DES SOLDES DE TRÉSORERIE ───────────────────────────────────

export async function calculateAccountBalance(
  accountId: number,
  txClient?: PrismaTransactionClient
): Promise<number> {
  const db = txClient || prisma;
  const account = await db.treasuryAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return 0;

  // 1. Solde initial
  let balance = account.openingBalance;

  // 2. Transferts reçus (entrées)
  const transfersIn = await db.treasuryTransfer.aggregate({
    where: { toAccountId: accountId },
    _sum: { amount: true },
  });
  balance += transfersIn._sum.amount ?? 0;

  // 3. Transferts émis (sorties)
  const transfersOut = await db.treasuryTransfer.aggregate({
    where: { fromAccountId: accountId },
    _sum: { amount: true },
  });
  balance -= transfersOut._sum.amount ?? 0;

  // 4. Encaissements clients (Ventes et encaissements directs)
  const salePaymentsIn = await db.payment.aggregate({
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
  });
  balance += salePaymentsIn._sum.amount ?? 0;

  // 5. Acomptes clients reçus
  const advancesIn = await db.customerAdvance.aggregate({
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
  });
  balance += advancesIn._sum.amount ?? 0;

  // 6. Recettes exceptionnelles / apports (Expenses de type income)
  const incomes = await db.expense.aggregate({
    where: {
      type: "income",
      OR: [
        { accountId: accountId },
        ...(account.isDefault
          ? [{ accountId: null, method: "cash" }]
          : []),
      ],
    },
    _sum: { amount: true },
  });
  balance += incomes._sum.amount ?? 0;

  // 7. Règlements Fournisseurs (Sorties)
  const supplierPaymentsOut = await db.payment.aggregate({
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
  });
  balance -= supplierPaymentsOut._sum.amount ?? 0;

  // 8. Dépenses d'exploitation (Expenses de type expense)
  const expensesOut = await db.expense.aggregate({
    where: {
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
  });
  balance -= expensesOut._sum.amount ?? 0;

  return Math.round(balance * 100) / 100;
}

// ─── RÉCUPÉRATION DES COMPTES & TABLEAU DE BORD TRÉSORERIE ────────────────────

export async function getTreasuryDashboardData(): Promise<TreasuryDashboardSummary> {
  const accounts = await prisma.treasuryAccount.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      transfersFrom: { select: { amount: true } },
      transfersTo: { select: { amount: true } },
    },
  });

  const enrichedAccounts: TreasuryAccountData[] = [];
  let totalTreasuryFunds = 0;

  for (const acc of accounts) {
    const currentBalance = await calculateAccountBalance(acc.id);
    const totalTransfersIn = acc.transfersTo.reduce((s, t) => s + t.amount, 0);
    const totalTransfersOut = acc.transfersFrom.reduce((s, t) => s + t.amount, 0);

    if (acc.isActive) {
      totalTreasuryFunds += currentBalance;
    }

    enrichedAccounts.push({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type as "cash" | "safe" | "bank" | "other",
      openingBalance: acc.openingBalance,
      openingDate: acc.openingDate.toISOString(),
      currentBalance,
      isDefault: acc.isDefault,
      isActive: acc.isActive,
      notes: acc.notes,
      transfersInCount: acc.transfersTo.length,
      transfersOutCount: acc.transfersFrom.length,
      totalTransfersIn,
      totalTransfersOut,
    });
  }

  const rawTransfers = await prisma.treasuryTransfer.findMany({
    take: 100,
    orderBy: { date: "desc" },
    include: {
      fromAccount: { select: { id: true, name: true, code: true } },
      toAccount: { select: { id: true, name: true, code: true } },
      session: { select: { id: true, reference: true } },
    },
  });

  const transfers: TreasuryTransferData[] = rawTransfers.map((t) => ({
    id: t.id,
    reference: t.reference,
    fromAccountId: t.fromAccountId,
    fromAccountName: t.fromAccount.name,
    fromAccountCode: t.fromAccount.code,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount.name,
    toAccountCode: t.toAccount.code,
    amount: t.amount,
    motif: t.motif,
    notes: t.notes,
    date: t.date.toISOString(),
    sessionId: t.sessionId,
    sessionRef: t.session?.reference ?? null,
    createdAt: t.createdAt.toISOString(),
  }));

  return {
    accounts: enrichedAccounts,
    transfers,
    totalTreasuryFunds: Math.round(totalTreasuryFunds * 100) / 100,
    activeAccountsCount: accounts.filter((a) => a.isActive).length,
  };
}

// ─── CRÉATION D'UN NOUVEAU COMPTE DE TRÉSORERIE ──────────────────────────────

export async function createTreasuryAccountAction(formData: FormData) {
  try {
    const name = (formData.get("name") as string)?.trim();
    const type = (formData.get("type") as string) || "safe";
    const openingBalanceStr = formData.get("openingBalance") as string;
    const notes = (formData.get("notes") as string)?.trim() || null;
    const openingDateStr = formData.get("openingDate") as string;

    if (!name || name.length < 2) {
      return {
        success: false,
        error: "Le nom du compte est obligatoire (au moins 2 caractères).",
      };
    }

    const openingBalance = openingBalanceStr ? parseFloat(openingBalanceStr) : 0;
    if (isNaN(openingBalance) || openingBalance < 0) {
      return {
        success: false,
        error: "Le solde initial d'ouverture doit être un montant positif ou nul en DA.",
      };
    }

    const validTypes = ["cash", "safe", "bank", "other"];
    if (!validTypes.includes(type)) {
      return { success: false, error: "Type de compte de trésorerie non reconnu." };
    }

    // Unicité du nom
    const existing = await prisma.treasuryAccount.findFirst({
      where: { name: { equals: name } },
    });
    if (existing) {
      return {
        success: false,
        error: `Un compte de trésorerie intitulé "${name}" existe déjà.`,
      };
    }

    const code = await generateNextTreasuryAccountCode(type);
    const openingDate = openingDateStr ? new Date(openingDateStr) : new Date();

    const account = await prisma.treasuryAccount.create({
      data: {
        code,
        name,
        type,
        openingBalance,
        openingDate,
        notes,
        isDefault: false,
        isActive: true,
      },
    });

    safeRevalidate();

    return {
      success: true,
      message: `Compte de trésorerie "${account.name}" (${account.code}) créé avec succès (Solde d'ouverture : ${openingBalance.toLocaleString("fr-DZ")} DA).`,
      data: account,
    };
  } catch (err: unknown) {
    console.error("Erreur création compte trésorerie:", err);
    return {
      success: false,
      error: "Erreur lors de la création du compte de trésorerie.",
    };
  }
}

// ─── MISE À JOUR D'UN COMPTE DE TRÉSORERIE ────────────────────────────────────

export async function updateTreasuryAccountAction(
  accountId: number,
  formData: FormData
) {
  try {
    const name = (formData.get("name") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim() || null;
    const isActiveStr = formData.get("isActive") as string;

    const account = await prisma.treasuryAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return { success: false, error: "Compte de trésorerie introuvable." };
    }

    if (!name || name.length < 2) {
      return { success: false, error: "Le nom du compte est obligatoire." };
    }

    const isActive = isActiveStr !== undefined ? isActiveStr === "true" || isActiveStr === "1" : account.isActive;

    if (!isActive && account.isDefault) {
      return {
        success: false,
        error: "Impossible de désactiver le compte de caisse principale par défaut.",
      };
    }

    const updated = await prisma.treasuryAccount.update({
      where: { id: accountId },
      data: {
        name,
        notes,
        isActive,
      },
    });

    safeRevalidate();

    return {
      success: true,
      message: `Compte "${updated.name}" mis à jour avec succès.`,
      data: updated,
    };
  } catch (err: unknown) {
    console.error("Erreur mise à jour compte trésorerie:", err);
    return {
      success: false,
      error: "Erreur lors de la mise à jour du compte de trésorerie.",
    };
  }
}

// ─── TRANSFERT DE FONDS INTER-COMPTES (ATOMICITÉ & ANTI-DOUBLON) ─────────────

export async function createTreasuryTransferAction(payload: {
  fromAccountId?: number;
  toAccountId?: number;
  sourceAccountId?: number;
  destinationAccountId?: number;
  amount: number;
  motif: string;
  notes?: string;
  date?: string;
  sessionId?: number;
  reference?: string;
}) {
  try {
    const fromAccountId = Number(payload.fromAccountId ?? payload.sourceAccountId);
    const toAccountId = Number(payload.toAccountId ?? payload.destinationAccountId);
    const amount = Number(payload.amount);
    const motif = payload.motif?.trim();
    const notes = payload.notes?.trim() || null;
    const date = payload.date ? new Date(payload.date) : new Date();

    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: "Le montant du transfert doit être un nombre strictement positif en DA.",
      };
    }

    if (fromAccountId === toAccountId) {
      return {
        success: false,
        error: "Le compte source et le compte destination doivent être différents.",
      };
    }

    if (!motif || motif.length < 3) {
      return {
        success: false,
        error: "Le motif du transfert est obligatoire (au moins 3 caractères).",
      };
    }

    // Exécution transactionnelle atomique avec vérification stricte des fonds
    const result = await prisma.$transaction(async (tx) => {
      const fromAcc = await tx.treasuryAccount.findUnique({
        where: { id: fromAccountId },
      });
      const toAcc = await tx.treasuryAccount.findUnique({
        where: { id: toAccountId },
      });

      if (!fromAcc) {
        throw new Error("Compte source introuvable.");
      }
      if (!toAcc) {
        throw new Error("Compte destination introuvable.");
      }
      if (!fromAcc.isActive) {
        throw new Error(`Le compte source "${fromAcc.name}" est inactif.`);
      }
      if (!toAcc.isActive) {
        throw new Error(`Le compte destination "${toAcc.name}" est inactif.`);
      }

      // Vérification du solde disponible du compte source
      const currentSourceBalance = await calculateAccountBalance(fromAccountId, tx);
      if (currentSourceBalance < amount) {
        throw new Error(
          `Solde insuffisant sur le compte source "${fromAcc.name}". Solde disponible : ${currentSourceBalance.toLocaleString(
            "fr-DZ"
          )} DA, montant demandé : ${amount.toLocaleString("fr-DZ")} DA.`
        );
      }

      const reference = await generateNextTreasuryTransferReference(tx);

      const transfer = await tx.treasuryTransfer.create({
        data: {
          reference,
          fromAccountId,
          toAccountId,
          amount,
          motif,
          notes,
          date,
          sessionId: payload.sessionId || null,
        },
        include: {
          fromAccount: { select: { id: true, name: true, code: true } },
          toAccount: { select: { id: true, name: true, code: true } },
        },
      });

      return transfer;
    });

    safeRevalidate();

    return {
      success: true,
      message: `Transfert ${result.reference} effectué avec succès : ${amount.toLocaleString(
        "fr-DZ"
      )} DA de "${result.fromAccount.name}" vers "${result.toAccount.name}".`,
      data: result,
    };
  } catch (err: unknown) {
    console.error("Erreur transfert trésorerie:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'exécution du transfert de trésorerie.";
    return { success: false, error: msg };
  }
}

// ─── RELEVÉ DE COMPTE DÉTAILLÉ (RUNNING BALANCE LEDGER) ─────────────────────────

export async function getAccountMovements(
  accountId: number,
  filters?: { startDate?: string; endDate?: string }
): Promise<{
  account: TreasuryAccountData | null;
  movements: AccountMovementItem[];
  openingBalance: number;
  finalBalance: number;
}> {
  const account = await prisma.treasuryAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    return {
      account: null,
      movements: [],
      openingBalance: 0,
      finalBalance: 0,
    };
  }

  const movements: AccountMovementItem[] = [];

  // 1. Transferts reçus (inflow)
  const transfersIn = await prisma.treasuryTransfer.findMany({
    where: { toAccountId: accountId },
    include: { fromAccount: { select: { name: true } } },
  });
  for (const t of transfersIn) {
    movements.push({
      id: `trf-in-${t.id}`,
      date: t.date.toISOString(),
      reference: t.reference,
      type: "TRANSFER_IN",
      typeLabel: "Virement Interne Reçu",
      description: `${t.motif} (De : ${t.fromAccount.name})`,
      party: t.fromAccount.name,
      inflow: t.amount,
      outflow: 0,
      runningBalance: 0,
      method: "internal_transfer",
    });
  }

  // 2. Transferts émis (outflow)
  const transfersOut = await prisma.treasuryTransfer.findMany({
    where: { fromAccountId: accountId },
    include: { toAccount: { select: { name: true } } },
  });
  for (const t of transfersOut) {
    movements.push({
      id: `trf-out-${t.id}`,
      date: t.date.toISOString(),
      reference: t.reference,
      type: "TRANSFER_OUT",
      typeLabel: "Virement Interne Émis",
      description: `${t.motif} (Vers : ${t.toAccount.name})`,
      party: t.toAccount.name,
      inflow: 0,
      outflow: t.amount,
      runningBalance: 0,
      method: "internal_transfer",
    });
  }

  // 3. Encaissements ventes et caisse
  const salePayments = await prisma.payment.findMany({
    where: {
      status: { not: "cancelled" },
      purchaseId: null,
      supplierId: null,
      OR: [
        { accountId: accountId },
        ...(account.isDefault ? [{ accountId: null, method: "cash" }] : []),
      ],
    },
    include: { sale: { include: { customer: true } } },
  });
  for (const p of salePayments) {
    const cust = p.sale?.customer?.name || "Client comptoir";
    movements.push({
      id: `pay-sale-${p.id}`,
      date: p.paymentDate.toISOString(),
      reference: p.reference || `PAY-${p.id}`,
      type: "SALE_PAYMENT",
      typeLabel: "Encaissement Vente",
      description: `Règlement vente ${p.sale?.reference || ""} — ${cust}`,
      party: cust,
      inflow: p.amount,
      outflow: 0,
      runningBalance: 0,
      method: p.method,
      docReference: p.sale?.reference,
    });
  }

  // 4. Acomptes clients
  const advances = await prisma.customerAdvance.findMany({
    where: {
      status: { not: "cancelled" },
      OR: [
        { accountId: accountId },
        ...(account.isDefault ? [{ accountId: null, method: "cash" }] : []),
      ],
    },
    include: { customer: true },
  });
  for (const adv of advances) {
    const cust = adv.customer.name;
    movements.push({
      id: `adv-${adv.id}`,
      date: adv.paymentDate.toISOString(),
      reference: adv.reference,
      type: "CUSTOMER_ADVANCE",
      typeLabel: "Acompte Client",
      description: `Versement d'acompte — ${cust}`,
      party: cust,
      inflow: adv.amount,
      outflow: 0,
      runningBalance: 0,
      method: adv.method,
    });
  }

  // 5. Règlements Fournisseurs
  const supplierPayments = await prisma.payment.findMany({
    where: {
      status: { not: "cancelled" },
      AND: [
        {
          OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }],
        },
        {
          OR: [
            { accountId: accountId },
            ...(account.isDefault ? [{ accountId: null, method: "cash" }] : []),
          ],
        },
      ],
    },
    include: {
      purchase: { include: { supplier: true } },
      supplier: true,
    },
  });
  for (const p of supplierPayments) {
    const supp = p.purchase?.supplier?.name || p.supplier?.name || "Fournisseur";
    movements.push({
      id: `pay-supp-${p.id}`,
      date: p.paymentDate.toISOString(),
      reference: p.reference || `PAYF-${p.id}`,
      type: "SUPPLIER_PAYMENT",
      typeLabel: "Paiement Fournisseur",
      description: `Règlement fournisseur — ${supp}`,
      party: supp,
      inflow: 0,
      outflow: p.amount,
      runningBalance: 0,
      method: p.method,
      docReference: p.purchase?.reference,
    });
  }

  // 6. Dépenses d'exploitation et encaissements exceptionnels
  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { accountId: accountId },
        ...(account.isDefault
          ? [{ accountId: null, method: "cash" }]
          : account.code === "ACC-BANQUE"
          ? [{ accountId: null, method: "transfer" }]
          : []),
      ],
    },
  });
  for (const e of expenses) {
    const isIncome = e.type === "income";
    movements.push({
      id: `exp-${e.id}`,
      date: e.date.toISOString(),
      reference: e.reference,
      type: isIncome ? "INCOME" : "EXPENSE",
      typeLabel: isIncome ? "Recette Exceptionnelle" : "Dépense d'Exploitation",
      description: e.description,
      party: e.beneficiary || "Interne",
      inflow: isIncome ? e.amount : 0,
      outflow: isIncome ? 0 : e.amount,
      runningBalance: 0,
      method: e.method,
      docReference: e.receiptNumber,
    });
  }

  // Tri chronologique croissant pour calculer la running balance
  movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = account.openingBalance;
  for (const m of movements) {
    running = running + m.inflow - m.outflow;
    m.runningBalance = Math.round(running * 100) / 100;
  }

  // Filtrage éventuel par plage de dates
  let filtered = movements;
  if (filters?.startDate) {
    const s = new Date(filters.startDate).setHours(0, 0, 0, 0);
    filtered = filtered.filter((m) => new Date(m.date).getTime() >= s);
  }
  if (filters?.endDate) {
    const e = new Date(filters.endDate).setHours(23, 59, 59, 999);
    filtered = filtered.filter((m) => new Date(m.date).getTime() <= e);
  }

  // Tri décroissant pour affichage UI
  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const currentBalance = await calculateAccountBalance(accountId);

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type as "cash" | "safe" | "bank" | "other",
      openingBalance: account.openingBalance,
      openingDate: account.openingDate.toISOString(),
      currentBalance,
      isDefault: account.isDefault,
      isActive: account.isActive,
      notes: account.notes,
      transfersInCount: transfersIn.length,
      transfersOutCount: transfersOut.length,
      totalTransfersIn: transfersIn.reduce((s, t) => s + t.amount, 0),
      totalTransfersOut: transfersOut.reduce((s, t) => s + t.amount, 0),
    },
    movements: filtered,
    openingBalance: account.openingBalance,
    finalBalance: currentBalance,
  };
}
