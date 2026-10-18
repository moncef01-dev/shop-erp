"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ShopSettingsData } from "@/app/settings/actions";

export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CashActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Revalidation outside HTTP context (e.g. testing) is safely ignored
  }
}

// ─── GÉNÉRATEURS DE RÉFÉRENCES SÉQUENTIELLES UNIQUE ──────────────────────────

export async function generateNextCashSessionReference(txClient?: PrismaTransactionClient): Promise<string> {
  const db = txClient || prisma;
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

export async function generateNextExpenseReference(
  type: "expense" | "income" = "expense",
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
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

// ─── GESTION DES SESSIONS DE CAISSE (OUVERTURE & CLÔTURE) ────────────────────

export async function openCashSessionAction(payload: {
  openingAmount: number;
  openingNotes?: string;
  openedAt?: string;
}): Promise<CashActionResponse> {
  try {
    const openingAmount = Number(payload.openingAmount);
    if (isNaN(openingAmount) || openingAmount < 0) {
      return {
        success: false,
        error: "Le solde d'ouverture doit être un montant positif ou nul en DA.",
      };
    }

    // Vérifier si une session est déjà ouverte (conception mono-caisse)
    const existingActive = await prisma.cashSession.findFirst({
      where: { status: "open" },
    });

    if (existingActive) {
      return {
        success: false,
        error: `Une session de caisse est déjà active (${existingActive.reference}) ouverte le ${new Date(
          existingActive.openedAt
        ).toLocaleDateString("fr-DZ")}. Veuillez clôturer la session en cours avant d'en ouvrir une nouvelle.`,
      };
    }

    const reference = await generateNextCashSessionReference();
    const openedAt = payload.openedAt ? new Date(payload.openedAt) : new Date();

    const session = await prisma.cashSession.create({
      data: {
        reference,
        status: "open",
        openingAmount,
        openedAt,
        openingNotes: payload.openingNotes?.trim() || null,
      },
    });

    safeRevalidate("/cash");

    return {
      success: true,
      message: `Session de caisse ${reference} ouverte avec succès (Fond de caisse : ${openingAmount.toLocaleString(
        "fr-DZ"
      )} DA).`,
      data: session,
    };
  } catch (err: unknown) {
    console.error("Erreur ouverture session caisse:", err);
    return {
      success: false,
      error: "Erreur lors de l'ouverture de la session de caisse.",
    };
  }
}

export async function closeCashSessionAction(payload: {
  sessionId: number;
  closingAmount: number;
  closingNotes?: string;
}): Promise<CashActionResponse> {
  try {
    const sessionId = Number(payload.sessionId);
    const closingAmount = Number(payload.closingAmount);

    if (isNaN(closingAmount) || closingAmount < 0) {
      return {
        success: false,
        error: "Le montant physique compté doit être un nombre positif ou nul en DA.",
      };
    }

    const session = await prisma.cashSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { success: false, error: "Session de caisse introuvable." };
    }

    if (session.status === "closed") {
      return {
        success: false,
        error: "Cette session de caisse est déjà clôturée et ne peut plus être modifiée (archivage immuable).",
      };
    }

    const now = new Date();

    // Calcul autoritaire côté serveur sur la fenêtre [openedAt, now]
    // 1. Encaissements physiques (Ventes en espèces)
    const salesPayments = await prisma.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        saleId: { not: null },
        paymentDate: { gte: session.openedAt, lte: now },
      },
      select: { id: true, amount: true },
    });
    const cashInSales = salesPayments.reduce((acc, p) => acc + p.amount, 0);

    // 2. Décaissements physiques (Fournisseurs en espèces)
    const supplierPayments = await prisma.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        purchaseId: { not: null },
        paymentDate: { gte: session.openedAt, lte: now },
      },
      select: { id: true, amount: true },
    });
    const cashOutPurchases = supplierPayments.reduce((acc, p) => acc + p.amount, 0);

    // 3. Charges et encaissements exceptionnels en espèces
    const expenses = await prisma.expense.findMany({
      where: {
        method: "cash",
        date: { gte: session.openedAt, lte: now },
      },
      select: { id: true, amount: true, type: true },
    });
    const cashOutExpenses = expenses
      .filter((e) => e.type === "expense")
      .reduce((acc, e) => acc + e.amount, 0);
    const cashInOther = expenses
      .filter((e) => e.type === "income")
      .reduce((acc, e) => acc + e.amount, 0);

    const totalCashIn = cashInSales + cashInOther;
    const totalCashOut = cashOutPurchases + cashOutExpenses;
    const theoreticalAmount = session.openingAmount + totalCashIn - totalCashOut;
    const difference = closingAmount - theoreticalAmount;

    // Mise à jour atomique de clôture
    const closedSession = await prisma.$transaction(async (tx) => {
      // Mettre à jour la session
      const updated = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: "closed",
          closedAt: now,
          totalCashIn,
          totalCashOut,
          theoreticalAmount,
          closingAmount,
          difference,
          closingNotes: payload.closingNotes?.trim() || null,
        },
      });

      // Lier la session aux paiements et dépenses concernés pour historique
      const paymentIds = [...salesPayments.map((p) => p.id), ...supplierPayments.map((p) => p.id)];
      if (paymentIds.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: paymentIds } },
          data: { sessionId: sessionId },
        });
      }

      const expenseIds = expenses.map((e) => e.id);
      if (expenseIds.length > 0) {
        await tx.expense.updateMany({
          where: { id: { in: expenseIds } },
          data: { sessionId: sessionId },
        });
      }

      return updated;
    });

    safeRevalidate("/cash");

    let diffMsg = "";
    if (difference === 0) {
      diffMsg = "Caisse parfaitement équilibrée (Écart: 0 DA).";
    } else if (difference > 0) {
      diffMsg = `Excédent de caisse constaté : +${difference.toLocaleString("fr-DZ")} DA.`;
    } else {
      diffMsg = `Déficit de caisse constaté : ${difference.toLocaleString("fr-DZ")} DA.`;
    }

    return {
      success: true,
      message: `Session ${closedSession.reference} clôturée avec succès. ${diffMsg}`,
      data: closedSession,
    };
  } catch (err: unknown) {
    console.error("Erreur clôture session caisse:", err);
    return {
      success: false,
      error: "Erreur lors de la clôture de la session de caisse.",
    };
  }
}

// ─── GESTION DES DÉPENSES & ENCAISSEMENTS MANUELS ─────────────────────────────

export async function createExpenseAction(formData: FormData): Promise<CashActionResponse> {
  try {
    const type = (formData.get("type") as string) || "expense";
    const category = (formData.get("category") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const amountStr = formData.get("amount") as string;
    const method = (formData.get("method") as string) || "cash";
    const beneficiary = (formData.get("beneficiary") as string)?.trim() || null;
    const receiptNumber = (formData.get("receiptNumber") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;
    const dateStr = formData.get("date") as string;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: "Le montant doit être un nombre strictement supérieur à zéro en DA.",
      };
    }

    if (!description || description.length < 3) {
      return {
        success: false,
        error: "La description / motif est obligatoire (au moins 3 caractères).",
      };
    }

    if (!category) {
      return {
        success: false,
        error: "Veuillez sélectionner une catégorie valide pour cette opération.",
      };
    }

    const validMethods = ["cash", "transfer", "check", "cib"];
    if (!validMethods.includes(method)) {
      return {
        success: false,
        error: "Mode de règlement non reconnu.",
      };
    }

    // Si règlement en espèces, rattacher automatiquement à la session ouverte s'il y en a une
    let sessionId: number | null = null;
    if (method === "cash") {
      const activeSession = await prisma.cashSession.findFirst({
        where: { status: "open" },
      });
      if (activeSession) {
        sessionId = activeSession.id;
      }
    }

    const reference = await generateNextExpenseReference(type === "income" ? "income" : "expense");
    const date = dateStr ? new Date(dateStr) : new Date();

    const expense = await prisma.expense.create({
      data: {
        reference,
        type: type === "income" ? "income" : "expense",
        category,
        description,
        amount,
        method,
        beneficiary,
        receiptNumber,
        notes,
        date,
        sessionId,
      },
    });

    safeRevalidate("/cash");

    const label = type === "income" ? "Encaissement" : "Dépense";
    return {
      success: true,
      message: `${label} ${reference} enregistrée avec succès (${amount.toLocaleString("fr-DZ")} DA via ${
        method === "cash" ? "Espèces" : method === "cib" ? "CIB" : method === "check" ? "Chèque" : "Virement"
      }).`,
      data: expense,
    };
  } catch (err: unknown) {
    console.error("Erreur création dépense:", err);
    return {
      success: false,
      error: "Erreur lors de l'enregistrement de la dépense.",
    };
  }
}

export async function deleteExpenseAction(expenseId: number): Promise<CashActionResponse> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { session: true },
    });

    if (!expense) {
      return { success: false, error: "Dépense introuvable." };
    }

    if (expense.session && expense.session.status === "closed") {
      return {
        success: false,
        error: "Impossible de supprimer une dépense rattachée à une session de caisse déjà clôturée.",
      };
    }

    await prisma.expense.delete({ where: { id: expenseId } });

    safeRevalidate("/cash");

    return {
      success: true,
      message: `La pièce ${expense.reference} a été supprimée avec succès.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression dépense:", err);
    return {
      success: false,
      error: "Erreur lors de la suppression de la dépense.",
    };
  }
}

// ─── TYPES & INTERFACES DU JOURNAL ET DU TABLEAU DE BORD ─────────────────────

export interface CashLedgerItem {
  id: string; // Ex: pay-1, payf-2, exp-3
  rawId: number;
  reference: string;
  date: string;
  type: "encaissement" | "decaissement";
  source: "sale" | "purchase" | "expense" | "income";
  category: string;
  description: string;
  partyName: string;
  docReference?: string | null;
  method: string; // cash, transfer, check, cib
  amount: number;
  notes?: string | null;
  affectsCash: boolean; // true si method === "cash"
  sessionId?: number | null;
  sessionRef?: string | null;
}

export interface TreasuryChannelSummary {
  method: string;
  label: string;
  inflows: number;
  outflows: number;
  net: number;
}

export interface CashDashboardData {
  activeSession: {
    id: number;
    reference: string;
    openedAt: string;
    openingAmount: number;
    openingNotes?: string | null;
    status: string;
    currentCashIn: number;
    currentCashOut: number;
    currentTheoreticalCash: number;
    eligibleTransactionsCount: number;
  } | null;
  sessions: {
    id: number;
    reference: string;
    openedAt: string;
    closedAt?: string | null;
    status: string;
    openingAmount: number;
    totalCashIn: number;
    totalCashOut: number;
    theoreticalAmount?: number | null;
    closingAmount?: number | null;
    difference?: number | null;
    openingNotes?: string | null;
    closingNotes?: string | null;
  }[];
  ledger: CashLedgerItem[];
  metrics: {
    // Caisse physique
    physicalOpening: number;
    physicalInflows: number;
    physicalOutflows: number;
    physicalTheoretical: number;
    physicalCounted?: number | null;
    physicalDiscrepancy?: number | null;
    // Canaux bancaires & électroniques
    channels: Record<string, TreasuryChannelSummary>;
    // Trésorerie globale
    globalInflows: number;
    globalOutflows: number;
    globalNet: number;
  };
  settings?: ShopSettingsData | null;
  expensesCount: number;
}

function formatExpenseCategory(cat: string): string {
  switch (cat) {
    case "transport":
      return "Transport & Livraison";
    case "utilities":
      return "Électricité, Gaz & Eau";
    case "rent":
      return "Loyer & Charges locatives";
    case "maintenance":
      return "Entretien & Réparations";
    case "supplies":
      return "Fournitures de bureau";
    case "salary":
      return "Salaires & Avances";
    case "capital":
      return "Apport personnel exploitant";
    case "refund":
      return "Remboursement reçu";
    case "misc_income":
      return "Recette diverse";
    default:
      return cat.charAt(0).toUpperCase() + cat.slice(1);
  }
}

// ─── REQUÊTE PRINCIPALE : AUDIT & AGRÉGATION COMPLÈTE DU JOURNAL ──────────────

export async function getCashDashboardData(filters?: {
  startDate?: string;
  endDate?: string;
  method?: string;
  type?: string;
  searchQuery?: string;
}): Promise<CashDashboardData> {
  const query = filters?.searchQuery?.trim().toLowerCase();

  // 1. Récupérer toutes les sessions de caisse
  const sessions = await prisma.cashSession.findMany({
    orderBy: { openedAt: "desc" },
  });

  const activeRaw = sessions.find((s) => s.status === "open") || null;

  // 2. Récupérer l'ensemble des paiements existants (Clients & Fournisseurs) non annulés
  const payments = await prisma.payment.findMany({
    where: {
      status: { not: "cancelled" },
    },
    include: {
      sale: {
        include: {
          customer: true,
        },
      },
      purchase: {
        include: {
          supplier: true,
        },
      },
      session: {
        select: { id: true, reference: true },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  // 3. Récupérer l'ensemble des dépenses et mouvements manuels
  const expenses = await prisma.expense.findMany({
    include: {
      session: {
        select: { id: true, reference: true },
      },
    },
    orderBy: { date: "desc" },
  });

  // 4. Construire le Grand Livre unifié (Ledger) sans doublons
  const ledgerItems: CashLedgerItem[] = [];

  // 4.1 Encaissements clients (depuis payments où saleId != null)
  for (const p of payments) {
    if (p.saleId !== null) {
      const customerName = p.sale?.customer?.name || "Client Passager / Comptoir";
      ledgerItems.push({
        id: `pay-${p.id}`,
        rawId: p.id,
        reference: p.reference || `PAY-${String(p.id).padStart(4, "0")}`,
        date: p.paymentDate.toISOString(),
        type: "encaissement",
        source: "sale",
        category: "Vente Meubles",
        description: `Règlement vente ${p.sale?.reference || ""} — ${customerName}`,
        partyName: customerName,
        docReference: p.sale?.reference,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash: (p.method || "cash") === "cash",
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
      });
    } else if (p.purchaseId !== null) {
      // 4.2 Décaissements fournisseurs (depuis payments où purchaseId != null)
      const supplierName = p.purchase?.supplier?.name || "Fournisseur standard";
      ledgerItems.push({
        id: `payf-${p.id}`,
        rawId: p.id,
        reference: p.reference || `PAYF-${String(p.id).padStart(4, "0")}`,
        date: p.paymentDate.toISOString(),
        type: "decaissement",
        source: "purchase",
        category: "Achat Fournisseur",
        description: `Règlement achat ${p.purchase?.reference || ""} — ${supplierName}`,
        partyName: supplierName,
        docReference: p.purchase?.reference,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash: (p.method || "cash") === "cash",
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
      });
    }
  }

  // 4.3 Dépenses d'exploitation et encaissements exceptionnels (depuis expenses)
  for (const e of expenses) {
    const isIncome = e.type === "income";
    ledgerItems.push({
      id: isIncome ? `inc-${e.id}` : `exp-${e.id}`,
      rawId: e.id,
      reference: e.reference,
      date: e.date.toISOString(),
      type: isIncome ? "encaissement" : "decaissement",
      source: isIncome ? "income" : "expense",
      category: formatExpenseCategory(e.category),
      description: e.description,
      partyName: e.beneficiary || "Interne Magasin",
      docReference: e.receiptNumber,
      method: e.method || "cash",
      amount: e.amount,
      notes: e.notes,
      affectsCash: (e.method || "cash") === "cash",
      sessionId: e.sessionId,
      sessionRef: e.session?.reference,
    });
  }

  // Tri chronologique décroissant
  ledgerItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 5. Calculs des métriques temps réel pour la session active
  let activeSessionData = null;
  if (activeRaw) {
    const sessionStart = new Date(activeRaw.openedAt).getTime();
    const sessionCashItems = ledgerItems.filter((item) => {
      if (!item.affectsCash) return false;
      const t = new Date(item.date).getTime();
      return t >= sessionStart;
    });

    const currentCashIn = sessionCashItems
      .filter((i) => i.type === "encaissement")
      .reduce((acc, i) => acc + i.amount, 0);

    const currentCashOut = sessionCashItems
      .filter((i) => i.type === "decaissement")
      .reduce((acc, i) => acc + i.amount, 0);

    const currentTheoreticalCash = activeRaw.openingAmount + currentCashIn - currentCashOut;

    activeSessionData = {
      id: activeRaw.id,
      reference: activeRaw.reference,
      openedAt: activeRaw.openedAt.toISOString(),
      openingAmount: activeRaw.openingAmount,
      openingNotes: activeRaw.openingNotes,
      status: activeRaw.status,
      currentCashIn,
      currentCashOut,
      currentTheoreticalCash,
      eligibleTransactionsCount: sessionCashItems.length,
    };
  }

  // 6. Application des filtres sur le ledger affiché
  let filteredLedger = ledgerItems;

  if (filters?.startDate) {
    const start = new Date(filters.startDate).setHours(0, 0, 0, 0);
    filteredLedger = filteredLedger.filter((i) => new Date(i.date).getTime() >= start);
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate).setHours(23, 59, 59, 999);
    filteredLedger = filteredLedger.filter((i) => new Date(i.date).getTime() <= end);
  }
  if (filters?.method && filters.method !== "all") {
    filteredLedger = filteredLedger.filter((i) => i.method === filters.method);
  }
  if (filters?.type && filters.type !== "all") {
    filteredLedger = filteredLedger.filter((i) => i.type === filters.type);
  }
  if (query) {
    filteredLedger = filteredLedger.filter(
      (i) =>
        i.reference.toLowerCase().includes(query) ||
        i.description.toLowerCase().includes(query) ||
        i.partyName.toLowerCase().includes(query) ||
        i.category.toLowerCase().includes(query) ||
        (i.docReference && i.docReference.toLowerCase().includes(query))
    );
  }

  // 7. Agrégation des flux par canal de paiement
  const channels: Record<string, TreasuryChannelSummary> = {
    cash: { method: "cash", label: "Espèces (Caisse Physique)", inflows: 0, outflows: 0, net: 0 },
    transfer: { method: "transfer", label: "Virement bancaire", inflows: 0, outflows: 0, net: 0 },
    check: { method: "check", label: "Chèque bancaire", inflows: 0, outflows: 0, net: 0 },
    cib: { method: "cib", label: "Carte CIB / Edahabia", inflows: 0, outflows: 0, net: 0 },
  };

  for (const item of ledgerItems) {
    const m = channels[item.method] || channels.cash;
    if (item.type === "encaissement") {
      m.inflows += item.amount;
    } else {
      m.outflows += item.amount;
    }
    m.net = m.inflows - m.outflows;
  }

  const globalInflows = Object.values(channels).reduce((acc, c) => acc + c.inflows, 0);
  const globalOutflows = Object.values(channels).reduce((acc, c) => acc + c.outflows, 0);
  const globalNet = globalInflows - globalOutflows;

  // Calcul caisse physique
  const physicalOpening = activeSessionData ? activeSessionData.openingAmount : 0;
  const physicalInflows = activeSessionData ? activeSessionData.currentCashIn : channels.cash.inflows;
  const physicalOutflows = activeSessionData ? activeSessionData.currentCashOut : channels.cash.outflows;
  const physicalTheoretical = activeSessionData
    ? activeSessionData.currentTheoreticalCash
    : channels.cash.inflows - channels.cash.outflows;

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

  return {
    activeSession: activeSessionData,
    sessions: sessions.map((s) => ({
      id: s.id,
      reference: s.reference,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      status: s.status,
      openingAmount: s.openingAmount,
      totalCashIn: s.totalCashIn,
      totalCashOut: s.totalCashOut,
      theoreticalAmount: s.theoreticalAmount,
      closingAmount: s.closingAmount,
      difference: s.difference,
      openingNotes: s.openingNotes,
      closingNotes: s.closingNotes,
    })),
    ledger: filteredLedger,
    settings,
    metrics: {
      physicalOpening,
      physicalInflows,
      physicalOutflows,
      physicalTheoretical,
      physicalCounted: null,
      physicalDiscrepancy: null,
      channels,
      globalInflows,
      globalOutflows,
      globalNet,
    },
    expensesCount: expenses.length,
  };
}
