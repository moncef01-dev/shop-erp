"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import type { TxClient } from "@/server/db";
import { assertPeriodNotLocked, assertDatesNotLocked } from "@/server/services/period-lock";
import { calculateAccountBalance as calculateAccountBalanceImpl } from "@/server/repositories/cash.repository";
import {
  findTreasuryAccountsWithTransfers,
  findRecentTreasuryTransfers,
  findTreasuryAccountByName,
  createTreasuryAccountRecord,
  updateTreasuryAccountRecord,
  findTreasuryAccountById,
  countTreasuryAccountsWithCodePrefix,
  findCashTreasuryAccountActive,
  findOpenCashSessionOrdered,
  findLastClosedSession,
  findTreasuryTransferById,
  findTreasuryTransferWithAccounts,
  createTreasuryTransferWithAccounts,
  updateTreasuryTransferWithAccounts,
  findLastAdjustmentReference,
  createAdjustmentExpense,
  findTransfersInToAccount,
  findTransfersOutFromAccount,
  findAccountSalePayments,
  findAccountAdvances,
  findAccountSupplierPayments,
  findAccountExpenses,
  findSuppAdditionalPaymentsForAccount,
} from "@/server/repositories/cash.repository";

export async function calculateAccountBalance(
  accountId: number,
  txClient?: TxClient
): Promise<number> {
  return calculateAccountBalanceImpl(accountId, txClient);
}

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
  paymentMethod: string;
  motif: string;
  notes: string | null;
  date: string;
  sessionId: number | null;
  sessionRef?: string | null;
  editHistory?: string | null;
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
    | "CUSTOMER_ADVANCE"
    | "SUPPLIER_ADDITIONAL_PAYMENT";
  typeLabel: string;
  description: string;
  party: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  method?: string;
  docReference?: string | null;
  sessionId?: number | null;
  createdAt?: string;
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
  txClient?: TxClient
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
  txClient?: TxClient
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


// ─── RÉCUPÉRATION DES COMPTES & TABLEAU DE BORD TRÉSORERIE ────────────────────

export async function getTreasuryDashboardData(): Promise<TreasuryDashboardSummary> {
  const accounts = await findTreasuryAccountsWithTransfers();

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

  const rawTransfers = await findRecentTreasuryTransfers();

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
    paymentMethod: t.paymentMethod || "cash",
    motif: t.motif,
    notes: t.notes,
    date: t.date.toISOString(),
    sessionId: t.sessionId,
    sessionRef: t.session?.reference ?? null,
    editHistory: t.editHistory ?? null,
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
    const existing = await findTreasuryAccountByName(name);
    if (existing) {
      return {
        success: false,
        error: `Un compte de trésorerie intitulé "${name}" existe déjà.`,
      };
    }

    const code = await generateNextTreasuryAccountCode(type);
    const openingDate = openingDateStr ? new Date(openingDateStr) : new Date();

    await assertPeriodNotLocked(openingDate, "Création de compte de trésorerie");

    const account = await createTreasuryAccountRecord({
      code,
      name,
      type,
      openingBalance,
      openingDate,
      notes,
      isDefault: false,
      isActive: true,
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

    const account = await findTreasuryAccountById(accountId);
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

    const updated = await updateTreasuryAccountRecord(accountId, {
      name,
      notes,
      isActive,
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
  paymentMethod?: string;
  motif: string;
  observation?: string;
  notes?: string;
  date?: string;
  sessionId?: number;
  reference?: string;
}) {
  try {
    const fromAccountId = Number(payload.fromAccountId ?? payload.sourceAccountId);
    const toAccountId = Number(payload.toAccountId ?? payload.destinationAccountId);
    const amount = Number(payload.amount);
    const paymentMethod = payload.paymentMethod || "cash";
    const motif = (payload.motif || payload.observation || payload.notes)?.trim();
    const notes = payload.notes?.trim() || null;
    let date = new Date();
    if (payload.date) {
      const trimmed = payload.date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        date = new Date(`${trimmed}T00:00:00.000Z`);
      } else {
        date = new Date(trimmed);
      }
    }

    await assertPeriodNotLocked(date, "Transfert de trésorerie");

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
    const result = await prisma.$transaction(
      async (tx) => {
      const fromAcc = await findTreasuryAccountById(fromAccountId, tx);
      const toAcc = await findTreasuryAccountById(toAccountId, tx);

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

      let sessionId = payload.sessionId || null;
      if (!sessionId) {
        const cashAcc = await findCashTreasuryAccountActive(tx);
        if (cashAcc && (fromAccountId === cashAcc.id || toAccountId === cashAcc.id)) {
          const activeSession = await findOpenCashSessionOrdered(tx);
          if (activeSession) {
            sessionId = activeSession.id;
          }
        }
      }

      const transfer = await createTreasuryTransferWithAccounts(tx, {
        reference,
        fromAccountId,
        toAccountId,
        amount,
        paymentMethod,
        motif,
        notes,
        date,
        sessionId,
      });

      return transfer;
    }, {
      maxWait: 5000,
      timeout: 15000,
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

// ─── MODIFICATION SÉCURISÉE D'UN TRANSFERT (INVERSION & AUDIT TRAIL) ─────────

export async function updateTreasuryTransferAction(payload: {
  transferId: number;
  amount: number;
  fromAccountId?: number;
  toAccountId?: number;
  paymentMethod?: string;
  motif?: string;
  observation?: string;
  notes?: string;
  date?: string;
  editReason: string;
}) {
  try {
    const transferId = Number(payload.transferId);
    const amount = Number(payload.amount);
    const editReason = payload.editReason?.trim();

    if (!editReason || editReason.length < 3) {
      return {
        success: false,
        error: "Le motif / justification de la modification est obligatoire pour l'audit comptable.",
      };
    }

    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: "Le montant du transfert doit être un nombre strictement positif en DA.",
      };
    }

    const updated = await prisma.$transaction(
      async (tx) => {
      const existing = await findTreasuryTransferWithAccounts(transferId, tx);
      if (!existing) {
        throw new Error("Transfert de trésorerie introuvable.");
      }

      const fromAccountId = payload.fromAccountId ? Number(payload.fromAccountId) : existing.fromAccountId;
      const toAccountId = payload.toAccountId ? Number(payload.toAccountId) : existing.toAccountId;
      const paymentMethod = payload.paymentMethod || existing.paymentMethod || "cash";
      const motif = (payload.motif || payload.observation || existing.motif)?.trim();
      const notes = payload.notes !== undefined ? (payload.notes?.trim() || null) : existing.notes;
      let date = existing.date;
      if (payload.date) {
        const trimmed = payload.date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          date = new Date(`${trimmed}T00:00:00.000Z`);
        } else {
          date = new Date(trimmed);
        }
      }

      await assertDatesNotLocked(
        [existing.date, date, new Date()],
        "Modification de transfert de trésorerie",
        tx
      );

      if (fromAccountId === toAccountId) {
        throw new Error("Le compte source et le compte destination doivent être distincts.");
      }

      if (!motif || motif.length < 3) {
        throw new Error("Le motif du transfert est obligatoire (au moins 3 caractères).");
      }

      // Inversion conceptuelle : si même compte source, on rajoute l'ancien montant pour tester le solde
      const currentBalance = await calculateAccountBalance(fromAccountId, tx);
      const effectiveAvailable =
        fromAccountId === existing.fromAccountId
          ? currentBalance + existing.amount
          : currentBalance;

      if (effectiveAvailable < amount) {
        throw new Error(
          `Solde insuffisant sur le compte source sélectionné. Solde disponible corrigé : ${effectiveAvailable.toLocaleString(
            "fr-DZ"
          )} DA, montant demandé : ${amount.toLocaleString("fr-DZ")} DA.`
        );
      }

      // Construction de l'audit trail
      const auditEntry = {
        editedAt: new Date().toISOString(),
        reason: editReason,
        previous: {
          fromAccountId: existing.fromAccountId,
          fromAccountName: existing.fromAccount.name,
          toAccountId: existing.toAccountId,
          toAccountName: existing.toAccount.name,
          amount: existing.amount,
          motif: existing.motif,
          paymentMethod: existing.paymentMethod,
          date: existing.date.toISOString(),
        },
        new: {
          fromAccountId,
          toAccountId,
          amount,
          motif,
          paymentMethod,
          date: date.toISOString(),
        },
      };

      let historyArray: unknown[] = [];
      if (existing.editHistory) {
        try {
          historyArray = JSON.parse(existing.editHistory);
        } catch {
          historyArray = [];
        }
      }
      historyArray.push(auditEntry);

      const res = await updateTreasuryTransferWithAccounts(tx, transferId, {
        fromAccountId,
        toAccountId,
        amount,
        paymentMethod,
        motif,
        notes,
        date,
        editHistory: JSON.stringify(historyArray),
      });

      return res;
    }, {
      maxWait: 5000,
      timeout: 15000,
    });

    safeRevalidate();

    return {
      success: true,
      message: `Transfert ${updated.reference} mis à jour avec succès (Audit tracé).`,
      data: updated,
    };
  } catch (err: unknown) {
    console.error("Erreur modification transfert trésorerie:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la modification du transfert.";
    return { success: false, error: msg };
  }
}

// ─── AJUSTEMENT TRACÉ DU SOLDE D'UN COMPTE (AUDITABLE) ───────────────────────

export async function adjustAccountBalanceAction(payload: {
  accountId: number;
  adjustmentType: "increase" | "decrease";
  amount: number;
  date?: string;
  reason: string;
  notes?: string;
}) {
  try {
    const accountId = Number(payload.accountId);
    const amount = Number(payload.amount);
    const adjustmentType = payload.adjustmentType;
    const reason = payload.reason?.trim();
    const notes = payload.notes?.trim() || null;
    const date = payload.date ? new Date(payload.date) : new Date();

    await assertPeriodNotLocked(date, "Ajustement de solde de compte");

    if (!reason || reason.length < 3) {
      return {
        success: false,
        error: "Le motif / justification explicite de l'ajustement est obligatoire pour l'audit.",
      };
    }

    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: "Le montant de l'ajustement doit être un nombre strictement supérieur à 0 DA.",
      };
    }

    const account = await findTreasuryAccountById(accountId);
    if (!account) {
      return { success: false, error: "Compte de trésorerie introuvable." };
    }

    const currentBalance = await calculateAccountBalance(accountId);

    if (adjustmentType === "decrease" && currentBalance < amount) {
      return {
        success: false,
        error: `Impossible d'ajuster à la baisse : le compte "${account.name}" ne dispose que de ${currentBalance.toLocaleString("fr-DZ")} DA.`,
      };
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prefix = `AJT-${yearMonth}-`;

    const last = await findLastAdjustmentReference(prefix);

    let nextSeq = 1;
    if (last?.reference) {
      const parts = last.reference.split("-");
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }
    const reference = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    await createAdjustmentExpense({
      reference,
      accountId,
      type: adjustmentType === "increase" ? "income" : "expense",
      category: "capital",
      description: `Ajustement de solde (${adjustmentType === "increase" ? "+" : "-"}) : ${reason}`,
      amount,
      method: "adjustment",
      beneficiary: "Audit interne",
      notes: notes ? `Ajustement tracé. ${notes}` : "Ajustement tracé avec journal d'audit.",
      date,
    });

    safeRevalidate();

    const newBalance = await calculateAccountBalance(accountId);

    return {
      success: true,
      message: `Ajustement tracé (${reference}) enregistré. Nouveau solde de "${account.name}" : ${newBalance.toLocaleString(
        "fr-DZ"
      )} DA.`,
    };
  } catch (err: unknown) {
    console.error("Erreur ajustement compte trésorerie:", err);
    return {
      success: false,
      error: "Erreur lors de l'enregistrement de l'ajustement de solde.",
    };
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
  const account = await findTreasuryAccountById(accountId);
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
  const transfersIn = await findTransfersInToAccount(accountId);
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
      sessionId: t.sessionId,
      createdAt: t.createdAt.toISOString(),
    });
  }

  // 2. Transferts émis (outflow)
  const transfersOut = await findTransfersOutFromAccount(accountId);
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
      sessionId: t.sessionId,
      createdAt: t.createdAt.toISOString(),
    });
  }

  // 3. Encaissements ventes et caisse
  const salePayments = await findAccountSalePayments(accountId, account.isDefault, account.type === "cash" || account.isDefault);
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
      sessionId: p.sessionId,
      createdAt: p.createdAt.toISOString(),
    });
  }

  // 4. Acomptes clients
  const advances = await findAccountAdvances(accountId, account.isDefault, account.type === "cash" || account.isDefault);
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
      sessionId: adv.sessionId,
      createdAt: adv.createdAt.toISOString(),
    });
  }

  // 5. Règlements Fournisseurs
  const supplierPayments = await findAccountSupplierPayments(accountId, account.isDefault, account.type === "cash" || account.isDefault);
  for (const p of supplierPayments) {
    const supp = p.purchase?.supplier?.name || p.supplier?.name || "Fournisseur";
    movements.push({
      id: `pay-supp-${p.id}`,
      date: p.paymentDate.toISOString(),
      reference: p.reference || `PAYF-${p.id}`,
      type: "SUPPLIER_PAYMENT",
      typeLabel: "Paiement Fournisseur",
      description: p.notes?.trim() ? p.notes.trim() : `Règlement fournisseur — ${supp}`,
      party: supp,
      inflow: 0,
      outflow: p.amount,
      runningBalance: 0,
      method: p.method,
      docReference: p.purchase?.reference,
      sessionId: p.sessionId,
      createdAt: p.createdAt.toISOString(),
    });
  }

  // 6. Dépenses d'exploitation et encaissements exceptionnels
  const expenses = await findAccountExpenses(accountId, account.isDefault, account.code, account.type === "cash" || account.isDefault);
  for (const e of expenses) {
    const isIncome = e.type === "income";
    let typeLabel = isIncome ? "Recette Exceptionnelle" : "Dépense d'Exploitation";
    if (isIncome && e.category === "capital") {
      typeLabel = "Apport Exploitant / Recette";
    } else if (!isIncome && e.category === "salary") {
      typeLabel = "Paiement Salaire";
    } else if (!isIncome && e.category === "capital") {
      typeLabel = "Prélèvement Exploitant";
    }

    movements.push({
      id: `exp-${e.id}`,
      date: e.date.toISOString(),
      reference: e.reference,
      type: isIncome ? "INCOME" : "EXPENSE",
      typeLabel,
      description: e.description,
      party: e.beneficiary || "Interne",
      inflow: isIncome ? e.amount : 0,
      outflow: isIncome ? 0 : e.amount,
      runningBalance: 0,
      method: e.method,
      docReference: e.receiptNumber,
      sessionId: e.sessionId,
      createdAt: e.createdAt.toISOString(),
    });
  }

  // 7. Versements supplémentaires fournisseurs et contrepassations
  try {
    const additionalPayments = await findSuppAdditionalPaymentsForAccount(accountId);
    for (const ap of additionalPayments) {
      if (!ap.isReversal) {
        movements.push({
          id: `supp-add-${ap.id}`,
          date: ap.date.toISOString(),
          reference: ap.reference,
          type: "SUPPLIER_ADDITIONAL_PAYMENT",
          typeLabel: "Versement supplémentaire fournisseur",
          description: ap.description || `Versement supplémentaire fournisseur — ${ap.supplier.name}`,
          party: ap.supplier.name,
          inflow: 0,
          outflow: ap.amount,
          runningBalance: 0,
          method: ap.paymentMethod,
          sessionId: ap.sessionId,
          createdAt: ap.createdAt.toISOString(),
        });
      } else {
        movements.push({
          id: `supp-add-rev-${ap.id}`,
          date: ap.date.toISOString(),
          reference: ap.reference,
          type: "SUPPLIER_ADDITIONAL_PAYMENT",
          typeLabel: "Annulation versement supplémentaire",
          description: ap.description || `Contrepassation versement ${ap.reversalOf?.reference || ""} — ${ap.supplier.name}`,
          party: ap.supplier.name,
          inflow: ap.amount,
          outflow: 0,
          runningBalance: 0,
          method: ap.paymentMethod,
          sessionId: ap.sessionId,
          createdAt: ap.createdAt.toISOString(),
        });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no such table")) throw err;
  }

  // Pour le compte de caisse journalière (type "cash" ou isDefault),
  // si aucune date de début spécifique n'est demandée et qu'une session clôturée existe,
  // le relevé part du montant arrêté lors de la dernière clôture.
  if ((account.isDefault || account.type === "cash") && !filters?.startDate) {
    const activeSession = await findOpenCashSessionOrdered();
    const latestClosed = await findLastClosedSession();

    const getMovementSortTime = (m: AccountMovementItem) => {
      const d = new Date(m.date).getTime();
      const c = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      if (new Date(m.date).getUTCHours() === 0 && new Date(m.date).getUTCMinutes() === 0 && c > 0) {
        return c;
      }
      return d;
    };

    if (activeSession) {
      const cutoffTime = latestClosed?.closedAt ? new Date(latestClosed.closedAt).getTime() : 0;
      const sessionMovements = movements.filter((m) => {
        if (m.sessionId === activeSession.id) return true;
        if (m.sessionId !== null && m.sessionId !== undefined) return false;
        const d = new Date(m.date).getTime();
        const c = m.createdAt ? new Date(m.createdAt).getTime() : 0;
        return d > cutoffTime || c > cutoffTime;
      });
      sessionMovements.sort((a, b) => getMovementSortTime(a) - getMovementSortTime(b));
      let run = activeSession.openingAmount;
      for (const m of sessionMovements) {
        run = run + m.inflow - m.outflow;
        m.runningBalance = Math.round(run * 100) / 100;
      }
      sessionMovements.sort((a, b) => getMovementSortTime(b) - getMovementSortTime(a));
      const currentBal = await calculateAccountBalance(accountId);
      return {
        account: {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type as "cash" | "safe" | "bank" | "other",
          openingBalance: account.openingBalance,
          openingDate: account.openingDate.toISOString(),
          currentBalance: currentBal,
          isDefault: account.isDefault,
          isActive: account.isActive,
          notes: account.notes,
          transfersInCount: transfersIn.length,
          transfersOutCount: transfersOut.length,
          totalTransfersIn: transfersIn.reduce((s, t) => s + t.amount, 0),
          totalTransfersOut: transfersOut.reduce((s, t) => s + t.amount, 0),
        },
        movements: sessionMovements,
        openingBalance: activeSession.openingAmount,
        finalBalance: currentBal,
      };
    } else if (latestClosed && latestClosed.closedAt) {
      const closedAtTime = new Date(latestClosed.closedAt).getTime();
      const recentMovements = movements.filter((m) => {
        const d = new Date(m.date).getTime();
        const c = m.createdAt ? new Date(m.createdAt).getTime() : 0;
        return d > closedAtTime || c > closedAtTime;
      });
      recentMovements.sort((a, b) => getMovementSortTime(a) - getMovementSortTime(b));
      let run = 0;
      for (const m of recentMovements) {
        run = run + m.inflow - m.outflow;
        m.runningBalance = Math.round(run * 100) / 100;
      }
      recentMovements.sort((a, b) => getMovementSortTime(b) - getMovementSortTime(a));
      const currentBal = await calculateAccountBalance(accountId);
      return {
        account: {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type as "cash" | "safe" | "bank" | "other",
          openingBalance: account.openingBalance,
          openingDate: account.openingDate.toISOString(),
          currentBalance: currentBal,
          isDefault: account.isDefault,
          isActive: account.isActive,
          notes: account.notes,
          transfersInCount: transfersIn.length,
          transfersOutCount: transfersOut.length,
          totalTransfersIn: transfersIn.reduce((s, t) => s + t.amount, 0),
          totalTransfersOut: transfersOut.reduce((s, t) => s + t.amount, 0),
        },
        movements: recentMovements,
        openingBalance: 0,
        finalBalance: currentBal,
      };
    }
  }

  // Tri chronologique croissant unifié :
  // 1. Date et heure effectives de l'opération (croissant, oldest first)
  // 2. Horodatage réel de saisie (createdAt) comme clé de départage
  // 3. Identifiant unique stable en dernier recours
  movements.sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (createdA !== createdB) return createdA - createdB;
    return a.id.localeCompare(b.id);
  });

  // Calcul du solde progressif (running balance) séquentiel
  let running = account.openingBalance;
  for (const m of movements) {
    running = Math.round((running + m.inflow - m.outflow) * 100) / 100;
    m.runningBalance = running;
  }

  // Ligne de solde initial / ouverture (première entrée du relevé, comptée une seule fois)
  const openingItem: AccountMovementItem = {
    id: `open-${account.id}`,
    date: account.openingDate.toISOString(),
    reference: "INITIAL",
    type: "OPENING",
    typeLabel: "Solde d'ouverture",
    description: "Solde initial du compte",
    party: "Système",
    inflow: account.openingBalance,
    outflow: 0,
    runningBalance: account.openingBalance,
    createdAt: account.openingDate.toISOString(),
  };

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

  // Vérifier si le relevé concerne spécifiquement le Coffre magasin
  const isCoffreMagasin = account.code === "ACC-COFFRE-MAGASIN" || account.type === "safe" || account.code.startsWith("ACC-COFFRE");

  if (isCoffreMagasin) {
    // Tri décroissant spécifique au Coffre magasin : PLUS RÉCENT EN HAUT (NEWEST → OLDEST)
    // 1. Date et heure effectives de l'opération (décroissant, plus récent en premier) avec fallback sur createdAt si date invalide
    // 2. Horodatage de saisie (createdAt) comme clé de départage déterministe (décroissant)
    // 3. Identifiant unique stable en dernier recours (décroissant)
    const getMovementSortTime = (m: AccountMovementItem) => {
      const d = new Date(m.date).getTime();
      const c = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      return isNaN(d) || d === 0 ? c : d;
    };

    filtered.sort((a, b) => {
      const timeA = getMovementSortTime(a);
      const timeB = getMovementSortTime(b);
      if (timeA !== timeB) return timeB - timeA;
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (createdA !== createdB) return createdB - createdA;
      return b.id.localeCompare(a.id);
    });
  }

  // Timeline chronologique unifiée :
  // - Pour le Coffre magasin : les opérations les plus récentes figurent en haut, les plus anciennes progressivement en dessous,
  //   et le solde initial d'ouverture (INITIAL) apparaît tout en bas du relevé.
  // - Pour les autres comptes : conservation stricte de l'ordre historique croissant (solde d'ouverture en tête).
  const shouldIncludeOpening =
    !filters?.startDate ||
    new Date(account.openingDate).getTime() >= new Date(filters.startDate).setHours(0, 0, 0, 0);

  const unifiedTimeline: AccountMovementItem[] = isCoffreMagasin
    ? (shouldIncludeOpening ? [...filtered, openingItem] : filtered)
    : (shouldIncludeOpening ? [openingItem, ...filtered] : filtered);

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
    movements: unifiedTimeline,
    openingBalance: account.openingBalance,
    finalBalance: currentBalance,
  };
}
