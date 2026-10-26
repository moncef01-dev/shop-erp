"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  MonthlyClosingDashboardData,
  MonthlyClosingTotals,
  MonthlyClosingChecklistItem,
  MonthlyClosingSnapshotItem,
  ChecklistStatus,
  DiscrepancyReviewItem,
  ExpenseCategoryBreakdown,
  TreasuryAccountMonthlySummary,
  WarehouseStockSummary,
  ClosingWorkflowStatus,
  ClosingBlocker,
  MonthlyClosingPeriodInfo,
  MonthlyClosingAuditLogItem,
} from "./types";
import { isMonthLocked } from "@/lib/period-lock";
import {
  getEffectiveDayStr,
  getCurrentMonthStr,
  getMonthBoundaries,
} from "./utils";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Silently ignore in non-request contexts
  }
}

// ─── 10 CONTRÔLES STANDARD DU POINTAGE DE FIN DE MOIS ─────────────────────────

const STANDARD_CHECKLIST_DEFINITIONS: {
  key: string;
  label: string;
  description: string;
  category: MonthlyClosingChecklistItem["category"];
}[] = [
  {
    key: "sessions_cash_reviewed",
    label: "1. Sessions de caisse journalière vérifiées",
    description: "Contrôle des ouvertures, clôtures, comptages physiques d'espèces et justification des écarts de caisse constatés.",
    category: "caisse",
  },
  {
    key: "treasury_reconciled",
    label: "2. Soldes de caisse et trésorerie rapprochés",
    description: "Rapprochement entre soldes théoriques calculés et soldes réels de chaque compte (caisse, coffres, banques).",
    category: "tresorerie",
  },
  {
    key: "transfers_reviewed",
    label: "3. Virements internes pointés et comptabilisés une seule fois",
    description: "Contrôle des transferts inter-comptes : aucune double comptabilisation, neutralité totale des mouvements internes.",
    category: "tresorerie",
  },
  {
    key: "sales_payments_reviewed",
    label: "4. Ventes et encaissements clients examinés",
    description: "Distinction rigoureuse entre chiffre d'affaires facturé et encaissements réels (espèces, chèques, virements, CIB).",
    category: "ventes",
  },
  {
    key: "customer_debts_reviewed",
    label: "5. Créances clients et acomptes arrêtés",
    description: "Revue détaillée des restes dus clients, créances en retard et solde des acomptes reçus non encore alloués.",
    category: "ventes",
  },
  {
    key: "supplier_balances_reviewed",
    label: "6. Soldes fournisseurs et retours marchandises vérifiés",
    description: "Rapprochement des réceptions/achats, règlements effectués, avoirs de retours marchandises et dettes fournisseurs résiduelles.",
    category: "achats",
  },
  {
    key: "expenses_reviewed",
    label: "7. Charges d'exploitation et produits exceptionnels contrôlés",
    description: "Vérification des pièces justificatives de dépenses, classification par catégorie et contrôle des encaissements exceptionnels.",
    category: "charges",
  },
  {
    key: "stock_inventory_reviewed",
    label: "8. Inventaire physique et valorisation des stocks examinés",
    description: "Concordance entre inventaire physique par dépôt et valorisation comptable au coût d'achat et au prix de vente.",
    category: "stock",
  },
  {
    key: "discrepancies_documented",
    label: "9. Écarts non résolus documentés et justifiés",
    description: "Recensement exhaustif et documentation explicite de toute divergence constatée nécessitant un arbitrage ou suivi.",
    category: "audit",
  },
  {
    key: "backup_completed",
    label: "10. Sauvegarde de la base de données SQLite effectuée",
    description: "Contrôle de l'intégrité de la base de données SQLite (PRAGMA integrity_check) et archivage d'une copie de sauvegarde horodatée.",
    category: "audit",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  transport: "Transport & Livraisons",
  utilities: "Électricité, Gaz & Eau",
  rent: "Loyer & Charges Locatives",
  maintenance: "Entretien & Réparations",
  supplies: "Fournitures & Emballages",
  salary: "Salaires & Primes",
  other: "Autres Charges d'Exploitation",
  capital: "Apport / Capital",
  misc_income: "Encaissement Exceptionnel",
  refund: "Remboursements & Restitutions",
};

// ─── GÉNÉRATION DES RÉFÉRENCES DE SNAPSHOT : CLM-YYYYMM-XXXX ───────────────────

export async function generateNextMonthlySnapshotReference(monthStr: string): Promise<string> {
  const cleanMonth = monthStr.replace("-", "");
  const prefix = `CLM-${cleanMonth}-`;

  const lastSnapshot = await prisma.monthlyClosingSnapshot.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastSnapshot?.reference) {
    const parts = lastSnapshot.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── CALCUL COMPLET DU DASHBOARD MENSUEL ──────────────────────────────────────

export async function getMonthlyClosingData(
  selectedMonth?: string
): Promise<MonthlyClosingDashboardData> {
  const currentMonth = getCurrentMonthStr();
  const month = selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : currentMonth;
  const isCurrentMonth = month === currentMonth;

  const boundaries = getMonthBoundaries(month);
  const { startDayStr, endDayStr } = boundaries;

  // 1. Paramètres de l'entreprise
  const rawSettings = await prisma.shopSettings.findFirst({ where: { id: 1 } });
  const shopSettings = {
    shopName: rawSettings?.shopName || "Shop ERP",
    activity: rawSettings?.activity || "Magasin d'Ameublement & Décoration",
    address: rawSettings?.address || "Zone Commerciale — Algérie",
    phone: rawSettings?.phone || "+213 (0) 550 00 00 00",
    email: rawSettings?.email || "contact@shoperp.dz",
    nifRc: rawSettings?.nifRc || "",
    nis: rawSettings?.nis || "",
    currency: rawSettings?.currency || "DA",
    documentFooter: rawSettings?.documentFooter || "Document de synthèse financière et inventaire.",
  };

  // 2. Récupération des données brutes
  const [
    allSales,
    allPayments,
    allCustomerAdvances,
    allPurchases,
    allSupplierDebts,
    allExpenses,
    allAccounts,
    allTransfers,
    allCashSessions,
    allProducts,
    allLocations,
    savedChecklistItems,
    savedSnapshots,
  ] = await Promise.all([
    // Ventes
    prisma.sales.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { costPrice: true, sellingPrice: true } },
          },
        },
      },
      orderBy: { saleDate: "asc" },
    }),

    // Règlements (Ventes et Fournisseurs)
    prisma.payment.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
        sale: { select: { id: true, reference: true, saleDate: true, customerId: true } },
        purchase: { select: { id: true, reference: true, supplierId: true } },
      },
      orderBy: { paymentDate: "asc" },
    }),

    // Acomptes clients
    prisma.customerAdvance.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        account: { select: { id: true, name: true, code: true } },
        allocations: {
          select: { id: true, amount: true, allocatedAt: true, saleId: true },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),

    // Achats
    prisma.purchase.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
      orderBy: { purchaseDate: "asc" },
    }),

    // Dettes et retours fournisseurs
    prisma.supplierDebt.findMany({
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: "asc" },
    }),

    // Charges et produits exceptionnels
    prisma.expense.findMany({
      include: {
        account: { select: { id: true, name: true, code: true, type: true } },
      },
      orderBy: { date: "asc" },
    }),

    // Comptes de trésorerie
    prisma.treasuryAccount.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    }),

    // Virements inter-comptes
    prisma.treasuryTransfer.findMany({
      include: {
        fromAccount: { select: { id: true, name: true, code: true } },
        toAccount: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: "asc" },
    }),

    // Sessions de caisse
    prisma.cashSession.findMany({
      include: {
        account: { select: { id: true, name: true, code: true } },
      },
      orderBy: { openedAt: "desc" },
    }),

    // Produits et valorisation de stock
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        categoryRef: { select: { name: true } },
        stocks: {
          include: {
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),

    // Dépôts / Magasins
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    }),

    // Pointage sauvegardé pour le mois
    prisma.monthlyClosingChecklist.findMany({
      where: { month },
    }),

    // Snapshots existants pour le mois
    prisma.monthlyClosingSnapshot.findMany({
      where: { month },
      orderBy: { version: "desc" },
    }),
  ]);

  // ─── 3. TRAITEMENT DES VENTES DU MOIS ───────────────────────────────────────
  const salesInMonth = allSales.filter((s) => {
    const day = getEffectiveDayStr(s.saleDate);
    return day.startsWith(month);
  });

  const confirmedSalesInMonth = salesInMonth.filter((s) => s.status === "confirmed");
  const draftSalesInMonth = salesInMonth.filter((s) => s.status === "draft");

  let totalInvoicedConfirmed = 0;
  let subtotalConfirmed = 0;
  let discountsConfirmed = 0;
  let deliveryFeesIncluded = 0;
  let deliveryFeesExcluded = 0;
  let costOfGoodsSoldEstimated = 0;

  for (const s of confirmedSalesInMonth) {
    totalInvoicedConfirmed += s.totalAmount;
    subtotalConfirmed += s.subtotal;
    discountsConfirmed += s.discount;

    if (s.includeDeliveryFee) {
      deliveryFeesIncluded += s.deliveryFee;
    } else {
      deliveryFeesExcluded += s.deliveryFee;
    }

    for (const item of s.items) {
      const unitCost = item.product?.costPrice ?? 0;
      costOfGoodsSoldEstimated += unitCost * item.quantity;
    }
  }

  const deliveryFeesTotal = deliveryFeesIncluded + deliveryFeesExcluded;
  const grossMarginEstimated = Math.max(0, totalInvoicedConfirmed - costOfGoodsSoldEstimated);

  let draftQuotesTotal = 0;
  let draftQuotesPaid = 0;
  for (const d of draftSalesInMonth) {
    draftQuotesTotal += d.totalAmount;
    draftQuotesPaid += d.paidAmount;
  }
  const draftQuotesRemaining = Math.max(0, draftQuotesTotal - draftQuotesPaid);
  const totalCommercialVolume = totalInvoicedConfirmed + draftQuotesTotal;

  // ─── 4. TRAITEMENT DES ENCAISSEMENTS DU MOIS ─────────────────────────────────
  // Paiements de ventes reçus dans le mois
  const salePaymentsInMonth = allPayments.filter((p) => {
    if (p.purchaseId !== null || p.supplierId !== null) return false;
    const day = getEffectiveDayStr(p.paymentDate);
    return day.startsWith(month);
  });

  let cashCollected = 0;
  let checkCollected = 0;
  let transferCollected = 0;
  let cibCollected = 0;
  let salePaymentsCollected = 0;

  for (const p of salePaymentsInMonth) {
    salePaymentsCollected += p.amount;
    const method = p.method.toLowerCase();
    if (method === "cash") cashCollected += p.amount;
    else if (method === "check" || method === "cheque") checkCollected += p.amount;
    else if (method === "transfer" || method === "virement") transferCollected += p.amount;
    else if (method === "cib" || method === "card" || method === "carte") cibCollected += p.amount;
    else cashCollected += p.amount;
  }

  // Acomptes clients reçus dans le mois
  const advancesInMonth = allCustomerAdvances.filter((a) => {
    const day = getEffectiveDayStr(a.paymentDate);
    return day.startsWith(month);
  });

  let customerAdvancesReceived = 0;
  for (const a of advancesInMonth) {
    customerAdvancesReceived += a.amount;
    const method = a.method.toLowerCase();
    if (method === "cash") cashCollected += a.amount;
    else if (method === "check" || method === "cheque") checkCollected += a.amount;
    else if (method === "transfer" || method === "virement") transferCollected += a.amount;
    else if (method === "cib" || method === "card") cibCollected += a.amount;
    else cashCollected += a.amount;
  }

  const totalCollected = salePaymentsCollected + customerAdvancesReceived;

  // ─── 5. CRÉANCES CLIENTS ARRÊTÉES EN FIN DE MOIS ─────────────────────────────
  // Ventes confirmées arrêtées au dernier jour du mois
  const salesUpToEnd = allSales.filter((s) => {
    const day = getEffectiveDayStr(s.saleDate);
    return day <= endDayStr;
  });

  // Paiements clients réalisés au plus tard au dernier jour du mois
  const paymentsUpToEnd = allPayments.filter((p) => {
    if (p.purchaseId !== null || p.supplierId !== null) return false;
    const day = getEffectiveDayStr(p.paymentDate);
    return day <= endDayStr;
  });

  // Acomptes clients reçus au plus tard au dernier jour du mois
  const advancesUpToEnd = allCustomerAdvances.filter((a) => {
    const day = getEffectiveDayStr(a.paymentDate);
    return day <= endDayStr;
  });

  // Associer les paiements et affectations d'acomptes aux ventes pour connaître le solde dû à fin de mois
  const salePaidMap = new Map<number, number>();
  for (const p of paymentsUpToEnd) {
    if (p.saleId) {
      salePaidMap.set(p.saleId, (salePaidMap.get(p.saleId) || 0) + p.amount);
    }
  }

  for (const a of advancesUpToEnd) {
    for (const al of a.allocations) {
      if (getEffectiveDayStr(al.allocatedAt) <= endDayStr && al.saleId) {
        salePaidMap.set(al.saleId, (salePaidMap.get(al.saleId) || 0) + al.amount);
      }
    }
  }

  let debtFromThisMonthSales = 0;
  let debtFromPriorSales = 0;
  let confirmedDebt = 0;
  let draftQuotesRemainingDebt = 0;
  const confirmedDebtorCustomerIds = new Set<number>();
  const draftQuoteCustomerIds = new Set<number>();

  for (const s of salesUpToEnd) {
    const paid = salePaidMap.get(s.id) || 0;
    const remaining = Math.max(0, s.totalAmount - paid);
    if (remaining > 0.01) {
      if (s.status === "confirmed") {
        if (s.customerId) confirmedDebtorCustomerIds.add(s.customerId);
        confirmedDebt += remaining;
        const isThisMonth = getEffectiveDayStr(s.saleDate).startsWith(month);
        if (isThisMonth) {
          debtFromThisMonthSales += remaining;
        } else {
          debtFromPriorSales += remaining;
        }
      } else if (s.status === "draft") {
        if (s.customerId) draftQuoteCustomerIds.add(s.customerId);
        draftQuotesRemainingDebt += remaining;
      }
    }
  }

  // Acomptes non consommés au dernier jour du mois
  let unallocatedAdvances = 0;
  for (const a of advancesUpToEnd) {
    // Calculer les allocations faites avant ou à la date de fin de mois
    const allocatedBeforeEnd = a.allocations.reduce((sum, al) => {
      const day = getEffectiveDayStr(al.allocatedAt);
      return day <= endDayStr ? sum + al.amount : sum;
    }, 0);
    const unallocated = Math.max(0, a.amount - allocatedBeforeEnd);
    unallocatedAdvances += unallocated;
  }

  // Les créances clients réelles sont UNIQUEMENT sur les factures confirmées (à l'exclusion des devis)
  const netConfirmedCustomerDebt = Math.max(0, confirmedDebt - unallocatedAdvances);

  // ─── 6. ACHATS & FOURNISSEURS DU MOIS ────────────────────────────────────────
  const purchasesInMonth = allPurchases.filter((p) => {
    const day = getEffectiveDayStr(p.purchaseDate);
    return day.startsWith(month);
  });

  let totalPurchases = 0;
  let purchasesPaid = 0;
  for (const p of purchasesInMonth) {
    totalPurchases += p.totalAmount;
    purchasesPaid += p.paidAmount;
  }
  const remainingFromMonthPurchases = Math.max(0, totalPurchases - purchasesPaid);

  // Règlements aux fournisseurs effectués dans le mois
  const supplierPaymentsInMonth = allPayments.filter((p) => {
    if (p.purchaseId === null && p.supplierId === null) return false;
    const day = getEffectiveDayStr(p.paymentDate);
    return day.startsWith(month);
  });
  const supplierPaymentsMade = supplierPaymentsInMonth.reduce((sum, p) => sum + p.amount, 0);

  // Retours fournisseurs enregistrés dans le mois
  const supplierReturnsInMonth = allSupplierDebts.filter((d) => {
    const isReturn = d.type === "supplier_return" || d.type === "return";
    if (!isReturn) return false;
    const day = getEffectiveDayStr(d.date);
    return day.startsWith(month);
  });
  const supplierReturnsAmount = supplierReturnsInMonth.reduce((sum, d) => sum + d.amount, 0);

  // Calcul du solde de dettes fournisseurs cumulé arrêté au dernier jour du mois
  const purchasesUpToEnd = allPurchases.filter((p) => getEffectiveDayStr(p.purchaseDate) <= endDayStr);
  const supplierPaymentsUpToEnd = allPayments.filter((p) => {
    if (p.purchaseId === null && p.supplierId === null) return false;
    return getEffectiveDayStr(p.paymentDate) <= endDayStr;
  });
  const supplierDebtsUpToEnd = allSupplierDebts.filter((d) => getEffectiveDayStr(d.date) <= endDayStr);

  const supplierBalanceMap = new Map<number, { initial: number; purchases: number; paid: number; returns: number }>();

  for (const d of supplierDebtsUpToEnd) {
    const cur = supplierBalanceMap.get(d.supplierId) || { initial: 0, purchases: 0, paid: 0, returns: 0 };
    if (d.type === "supplier_return" || d.type === "return") {
      cur.returns += d.amount;
    } else {
      cur.initial += d.amount;
    }
    supplierBalanceMap.set(d.supplierId, cur);
  }

  for (const p of purchasesUpToEnd) {
    if (!p.supplierId) continue;
    const cur = supplierBalanceMap.get(p.supplierId) || { initial: 0, purchases: 0, paid: 0, returns: 0 };
    cur.purchases += p.totalAmount;
    supplierBalanceMap.set(p.supplierId, cur);
  }

  for (const pay of supplierPaymentsUpToEnd) {
    const sId = pay.supplierId || pay.purchase?.supplierId;
    if (sId) {
      const cur = supplierBalanceMap.get(sId) || { initial: 0, purchases: 0, paid: 0, returns: 0 };
      cur.paid += pay.amount;
      supplierBalanceMap.set(sId, cur);
    }
  }

  let totalOutstandingDebtAtEnd = 0;
  let creditorsCount = 0;
  for (const [, b] of supplierBalanceMap.entries()) {
    const debt = Math.max(0, b.initial + b.purchases - b.paid - b.returns);
    if (debt > 0.01) {
      totalOutstandingDebtAtEnd += debt;
      creditorsCount += 1;
    }
  }

  // ─── 7. CHARGES & PRODUITS EXCEPTIONNELS ─────────────────────────────────────
  const expensesInMonth = allExpenses.filter((e) => {
    const day = getEffectiveDayStr(e.date);
    return day.startsWith(month);
  });

  let totalOperatingExpenses = 0;
  let exceptionalIncome = 0;
  let operatingCashPaid = 0;
  let operatingNonCashPaid = 0;
  const expenseCatMap = new Map<string, { total: number; count: number }>();

  for (const e of expensesInMonth) {
    if (e.type === "income") {
      exceptionalIncome += e.amount;
    } else {
      totalOperatingExpenses += e.amount;
      if (e.method.toLowerCase() === "cash") {
        operatingCashPaid += e.amount;
      } else {
        operatingNonCashPaid += e.amount;
      }
      const cat = e.category || "other";
      const cur = expenseCatMap.get(cat) || { total: 0, count: 0 };
      cur.total += e.amount;
      cur.count += 1;
      expenseCatMap.set(cat, cur);
    }
  }

  const expenseCategories: ExpenseCategoryBreakdown[] = Array.from(expenseCatMap.entries()).map(
    ([cat, data]) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      total: data.total,
      count: data.count,
    })
  );
  expenseCategories.sort((a, b) => b.total - a.total);

  // ─── 8. TRÉSORERIE PAR COMPTE & VIREMENTS INTERNES ──────────────────────────
  // Pour chaque compte, on calcule :
  // - Solde d'ouverture au 1er du mois (mouvements < startDayStr)
  // - Mouvements du mois : virements entrants, virements sortants, encaissements, décaissements
  // - Solde de clôture à la fin du mois
  const transfersInMonth = allTransfers.filter((t) => {
    const day = getEffectiveDayStr(t.date);
    return day.startsWith(month);
  });
  const totalTransfersVolume = transfersInMonth.reduce((sum, t) => sum + t.amount, 0);

  const defaultAccount = allAccounts.find((a) => a.isDefault || a.type === "cash") || allAccounts[0];

  const treasuryAccountsSummary: TreasuryAccountMonthlySummary[] = allAccounts.map((acc) => {
    const accId = acc.id;
    const isDef = acc.id === defaultAccount?.id;

    // A. Calcul du solde d'ouverture (mouvements avant le 1er du mois)
    let opening = acc.openingBalance;

    // Transferts avant le mois
    for (const t of allTransfers) {
      const day = getEffectiveDayStr(t.date);
      if (day < startDayStr) {
        if (t.toAccountId === accId) opening += t.amount;
        if (t.fromAccountId === accId) opening -= t.amount;
      }
    }

    // Encaissements ventes avant le mois
    for (const p of allPayments) {
      if (p.purchaseId !== null || p.supplierId !== null) continue;
      const day = getEffectiveDayStr(p.paymentDate);
      if (day < startDayStr) {
        if (p.accountId === accId || (isDef && p.accountId === null && p.method.toLowerCase() === "cash")) {
          opening += p.amount;
        }
      }
    }

    // Acomptes clients avant le mois
    for (const a of allCustomerAdvances) {
      const day = getEffectiveDayStr(a.paymentDate);
      if (day < startDayStr) {
        if (a.accountId === accId || (isDef && a.accountId === null && a.method.toLowerCase() === "cash")) {
          opening += a.amount;
        }
      }
    }

    // Produits exceptionnels avant le mois
    for (const e of allExpenses) {
      if (e.type !== "income") continue;
      const day = getEffectiveDayStr(e.date);
      if (day < startDayStr) {
        if (e.accountId === accId || (isDef && e.accountId === null && e.method.toLowerCase() === "cash")) {
          opening += e.amount;
        }
      }
    }

    // Règlements fournisseurs avant le mois
    for (const p of allPayments) {
      if (p.purchaseId === null && p.supplierId === null) continue;
      const day = getEffectiveDayStr(p.paymentDate);
      if (day < startDayStr) {
        if (p.accountId === accId || (isDef && p.accountId === null && p.method.toLowerCase() === "cash")) {
          opening -= p.amount;
        }
      }
    }

    // Charges d'exploitation avant le mois
    for (const e of allExpenses) {
      if (e.type !== "expense") continue;
      const day = getEffectiveDayStr(e.date);
      if (day < startDayStr) {
        if (e.accountId === accId || (isDef && e.accountId === null && e.method.toLowerCase() === "cash")) {
          opening -= e.amount;
        }
      }
    }

    opening = Math.round(opening * 100) / 100;

    // B. Mouvements PENDANT le mois sélectionné
    let trIn = 0;
    let trOut = 0;
    let inflows = 0;
    let outflows = 0;

    for (const t of transfersInMonth) {
      if (t.toAccountId === accId) trIn += t.amount;
      if (t.fromAccountId === accId) trOut += t.amount;
    }

    for (const p of salePaymentsInMonth) {
      if (p.accountId === accId || (isDef && p.accountId === null && p.method.toLowerCase() === "cash")) {
        inflows += p.amount;
      }
    }

    for (const a of advancesInMonth) {
      if (a.accountId === accId || (isDef && a.accountId === null && a.method.toLowerCase() === "cash")) {
        inflows += a.amount;
      }
    }

    for (const e of expensesInMonth) {
      if (e.type === "income") {
        if (e.accountId === accId || (isDef && e.accountId === null && e.method.toLowerCase() === "cash")) {
          inflows += e.amount;
        }
      } else {
        if (e.accountId === accId || (isDef && e.accountId === null && e.method.toLowerCase() === "cash")) {
          outflows += e.amount;
        }
      }
    }

    for (const p of supplierPaymentsInMonth) {
      if (p.accountId === accId || (isDef && p.accountId === null && p.method.toLowerCase() === "cash")) {
        outflows += p.amount;
      }
    }

    const closing = Math.round((opening + trIn - trOut + inflows - outflows) * 100) / 100;

    return {
      id: acc.id,
      name: acc.name,
      code: acc.code,
      type: acc.type,
      openingBalance: opening,
      transfersIn: Math.round(trIn * 100) / 100,
      transfersOut: Math.round(trOut * 100) / 100,
      otherInflows: Math.round(inflows * 100) / 100,
      otherOutflows: Math.round(outflows * 100) / 100,
      closingBalance: closing,
    };
  });

  const totalOpeningTreasury = treasuryAccountsSummary.reduce((sum, a) => sum + a.openingBalance, 0);
  const totalClosingTreasury = treasuryAccountsSummary.reduce((sum, a) => sum + a.closingBalance, 0);
  const netTreasuryVariation = Math.round((totalClosingTreasury - totalOpeningTreasury) * 100) / 100;

  // ─── 9. SESSIONS DE CAISSE JOURNALIÈRE ───────────────────────────────────────
  const sessionsInMonth = allCashSessions.filter((s) => {
    const day = getEffectiveDayStr(s.openedAt);
    return day.startsWith(month);
  });

  let closedCount = 0;
  let openCount = 0;
  let theoreticalTotal = 0;
  let closingCountedTotal = 0;
  let discrepancyTotal = 0;

  for (const s of sessionsInMonth) {
    if (s.status === "closed") {
      closedCount += 1;
      theoreticalTotal += s.theoreticalAmount ?? 0;
      closingCountedTotal += s.closingAmount ?? 0;
      discrepancyTotal += s.difference ?? 0;
    } else {
      openCount += 1;
    }
  }

  // Transferts de clôture de caisse vers les coffres
  const closingTransfers = transfersInMonth.filter((t) => t.sessionId !== null);
  const closingTransfersTotal = closingTransfers.reduce((sum, t) => sum + t.amount, 0);

  const manualTransfers = transfersInMonth.filter((t) => t.sessionId === null);
  const manualTransfersTotal = manualTransfers.reduce((sum, t) => sum + t.amount, 0);

  // ─── 10. STOCKS & VALORISATION ──────────────────────────────────────────────
  const warehouseMap = new Map<number, WarehouseStockSummary>();
  for (const loc of allLocations) {
    warehouseMap.set(loc.id, {
      locationId: loc.id,
      locationName: loc.name,
      locationCode: loc.code,
      totalQuantity: 0,
      valuationCost: 0,
      valuationSelling: 0,
      productCount: 0,
    });
  }

  let totalStockQuantity = 0;
  let valuationCost = 0;
  let valuationSelling = 0;
  let zeroStockCount = 0;
  let missingCostCount = 0;

  for (const prod of allProducts) {
    const qty = prod.stock;
    const cost = prod.costPrice ?? 0;
    const sell = prod.sellingPrice ?? 0;

    totalStockQuantity += qty;
    valuationCost += qty * cost;
    valuationSelling += qty * sell;

    if (qty <= 0) zeroStockCount += 1;
    if (cost <= 0 && qty > 0) missingCostCount += 1;

    for (const ps of prod.stocks) {
      const wh = warehouseMap.get(ps.locationId);
      if (wh) {
        wh.totalQuantity += ps.quantity;
        wh.valuationCost += ps.quantity * cost;
        wh.valuationSelling += ps.quantity * sell;
        if (ps.quantity > 0) wh.productCount += 1;
      }
    }
  }

  const warehouseSummaries = Array.from(warehouseMap.values());
  const potentialMargin = Math.max(0, valuationSelling - valuationCost);

  // ─── 11. ANOMALIES & DISCRÉPANCIES À RÉVISER ─────────────────────────────────
  const discrepancies: DiscrepancyReviewItem[] = [];

  // A. Sessions de caisse avec écart
  for (const s of sessionsInMonth) {
    if (s.status === "closed" && typeof s.difference === "number" && Math.abs(s.difference) > 0.01) {
      const isShortage = s.difference < 0;
      discrepancies.push({
        id: `cs-diff-${s.id}`,
        type: "cash_session_difference",
        severity: isShortage ? "error" : "warning",
        title: `Écart session de caisse ${s.reference}`,
        details: `${isShortage ? "Manquant d'espèces" : "Surplus d'espèces"} de ${Math.abs(s.difference).toLocaleString("fr-DZ")} DA (Théorique : ${(s.theoreticalAmount ?? 0).toLocaleString("fr-DZ")} DA, Réel : ${(s.closingAmount ?? 0).toLocaleString("fr-DZ")} DA). Notes : ${s.closingNotes || "Aucune justification"}`,
        reference: s.reference,
        amount: s.difference,
      });
    }
  }

  // B. Sessions toujours ouvertes du mois
  for (const s of sessionsInMonth) {
    if (s.status === "open") {
      discrepancies.push({
        id: `cs-open-${s.id}`,
        type: "open_cash_session",
        severity: "warning",
        title: `Session de caisse non fermée ${s.reference}`,
        details: `Ouverte le ${getEffectiveDayStr(s.openedAt)} avec un fond de ${(s.openingAmount).toLocaleString("fr-DZ")} DA. Les sessions doivent être clôturées quotidiennement pour figer les totaux.`,
        reference: s.reference,
        amount: s.openingAmount,
      });
    }
  }

  // C. Soldes de trésorerie négatifs
  for (const acc of treasuryAccountsSummary) {
    if (acc.closingBalance < -0.01) {
      discrepancies.push({
        id: `acc-neg-${acc.id}`,
        type: "negative_balance",
        severity: "error",
        title: `Solde négatif sur le compte ${acc.name}`,
        details: `Le compte présente un solde de fin de mois de ${acc.closingBalance.toLocaleString("fr-DZ")} DA. Vérifier les décaissements ou virements source.`,
        reference: acc.code,
        amount: acc.closingBalance,
      });
    }
  }

  // D. Articles en stock sans coût de revient
  if (missingCostCount > 0) {
    discrepancies.push({
      id: "stock-missing-cost",
      type: "missing_cost",
      severity: "warning",
      title: `${missingCostCount} article(s) en stock sans prix d'achat`,
      details: "Des articles possèdent une quantité positive en stock sans coût de revient renseigné, ce qui peut sous-évaluer la valeur d'inventaire.",
    });
  }

  // E. Traçabilité des virements manuels hors clôture de caisse
  for (const t of manualTransfers) {
    discrepancies.push({
      id: `trf-manual-${t.id}`,
      type: "audit_note",
      severity: "info",
      title: `Virement interne hors session de caisse : ${t.reference} (${t.amount.toLocaleString("fr-DZ")} DA)`,
      details: `Virement de ${t.amount.toLocaleString("fr-DZ")} DA du compte "${t.fromAccount.name}" vers "${t.toAccount.name}" effectué le ${getEffectiveDayStr(t.date)} (Motif: ${t.motif}). Ce transfert manuel hors clôture de caisse explique l'écart de ${t.amount.toLocaleString("fr-DZ")} DA entre le volume total des virements (${totalTransfersVolume.toLocaleString("fr-DZ")} DA) et les transferts de clôture de caisse (${closingTransfersTotal.toLocaleString("fr-DZ")} DA).`,
      reference: t.reference,
      amount: t.amount,
    });
  }

  // ─── 12. COMPILATION DE LA CHECKLIST ────────────────────────────────────────
  const savedChecklistMap = new Map(savedChecklistItems.map((c) => [c.itemKey, c]));

  const checklist: MonthlyClosingChecklistItem[] = STANDARD_CHECKLIST_DEFINITIONS.map((def) => {
    const saved = savedChecklistMap.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      category: def.category,
      status: (saved?.status as ChecklistStatus) || "PENDING",
      note: saved?.note || null,
      checkedBy: saved?.checkedBy || null,
      checkedAt: saved?.checkedAt ? saved.checkedAt.toISOString() : null,
    };
  });

  // ─── 13. TOTAUX FINANCIERS CONSOLIDÉS DU MOIS ──────────────────────────────
  const totals: MonthlyClosingTotals = {
    sales: {
      totalInvoiced: Math.round(totalInvoicedConfirmed * 100) / 100,
      confirmedCount: confirmedSalesInMonth.length,
      subtotal: Math.round(subtotalConfirmed * 100) / 100,
      discounts: Math.round(discountsConfirmed * 100) / 100,
      deliveryFees: Math.round(deliveryFeesIncluded * 100) / 100,
      deliveryFeesIncluded: Math.round(deliveryFeesIncluded * 100) / 100,
      deliveryFeesExcluded: Math.round(deliveryFeesExcluded * 100) / 100,
      deliveryFeesTotal: Math.round(deliveryFeesTotal * 100) / 100,
      costOfGoodsSoldEstimated: Math.round(costOfGoodsSoldEstimated * 100) / 100,
      grossMarginEstimated: Math.round(grossMarginEstimated * 100) / 100,
      draftQuotesCount: draftSalesInMonth.length,
      draftQuotesTotal: Math.round(draftQuotesTotal * 100) / 100,
      draftQuotesPaid: Math.round(draftQuotesPaid * 100) / 100,
      draftQuotesRemaining: Math.round(draftQuotesRemaining * 100) / 100,
      totalCommercialVolume: Math.round(totalCommercialVolume * 100) / 100,
      count: salesInMonth.length,
    },
    collections: {
      totalCollected: Math.round(totalCollected * 100) / 100,
      cash: Math.round(cashCollected * 100) / 100,
      check: Math.round(checkCollected * 100) / 100,
      transfer: Math.round(transferCollected * 100) / 100,
      cib: Math.round(cibCollected * 100) / 100,
      customerAdvancesReceived: Math.round(customerAdvancesReceived * 100) / 100,
      salePaymentsCollected: Math.round(salePaymentsCollected * 100) / 100,
    },
    customerDebt: {
      totalOutstanding: Math.round(netConfirmedCustomerDebt * 100) / 100,
      confirmedDebt: Math.round(confirmedDebt * 100) / 100,
      draftQuotesRemaining: Math.round(draftQuotesRemainingDebt * 100) / 100,
      debtFromThisMonthSales: Math.round(debtFromThisMonthSales * 100) / 100,
      debtFromPriorSales: Math.round(debtFromPriorSales * 100) / 100,
      unallocatedAdvances: Math.round(unallocatedAdvances * 100) / 100,
      debtorsCount: confirmedDebtorCustomerIds.size,
    },
    purchases: {
      totalInvoiced: Math.round(totalPurchases * 100) / 100,
      paidAmount: Math.round(purchasesPaid * 100) / 100,
      remainingFromMonthPurchases: Math.round(remainingFromMonthPurchases * 100) / 100,
      count: purchasesInMonth.length,
      supplierPaymentsMade: Math.round(supplierPaymentsMade * 100) / 100,
      supplierReturnsAmount: Math.round(supplierReturnsAmount * 100) / 100,
      supplierReturnsCount: supplierReturnsInMonth.length,
      totalOutstandingDebtAtEnd: Math.round(totalOutstandingDebtAtEnd * 100) / 100,
      creditorsCount,
    },
    expenses: {
      totalOperating: Math.round(totalOperatingExpenses * 100) / 100,
      exceptionalIncome: Math.round(exceptionalIncome * 100) / 100,
      categories: expenseCategories,
      operatingCashPaid: Math.round(operatingCashPaid * 100) / 100,
      operatingNonCashPaid: Math.round(operatingNonCashPaid * 100) / 100,
    },
    treasury: {
      accounts: treasuryAccountsSummary,
      totalOpening: Math.round(totalOpeningTreasury * 100) / 100,
      totalClosing: Math.round(totalClosingTreasury * 100) / 100,
      netVariation: Math.round(netTreasuryVariation * 100) / 100,
      totalTransfersVolume: Math.round(totalTransfersVolume * 100) / 100,
      closingTransfersTotal: Math.round(closingTransfersTotal * 100) / 100,
      manualTransfersTotal: Math.round(manualTransfersTotal * 100) / 100,
    },
    cashSessions: {
      totalCount: sessionsInMonth.length,
      closedCount,
      openCount,
      theoreticalTotal: Math.round(theoreticalTotal * 100) / 100,
      closingCountedTotal: Math.round(closingCountedTotal * 100) / 100,
      discrepancyTotal: Math.round(discrepancyTotal * 100) / 100,
      closingTransfersTotal: Math.round(closingTransfersTotal * 100) / 100,
      manualTransfersTotal: Math.round(manualTransfersTotal * 100) / 100,
      totalTransfersVolume: Math.round(totalTransfersVolume * 100) / 100,
      transfersCount: closingTransfers.length,
    },
    stock: {
      totalQuantity: isCurrentMonth ? totalStockQuantity : 0,
      valuationCost: isCurrentMonth ? Math.round(valuationCost * 100) / 100 : 0,
      valuationSelling: isCurrentMonth ? Math.round(valuationSelling * 100) / 100 : 0,
      potentialMargin: isCurrentMonth ? Math.round(potentialMargin * 100) / 100 : 0,
      warehouses: isCurrentMonth ? warehouseSummaries : [],
      activeProductCount: allProducts.length,
      zeroStockCount: isCurrentMonth ? zeroStockCount : 0,
      valuationBasis: isCurrentMonth ? "LIVE" : "UNAVAILABLE",
      valuationTimestamp: new Date().toISOString(),
      valuationNotice: isCurrentMonth
        ? `Inventaire physique en temps réel relevé le ${new Date().toLocaleDateString("fr-FR")} (en cours de mois, non arrêté au ${endDayStr.slice(8, 10)}/${endDayStr.slice(5, 7)}/${endDayStr.slice(0, 4)})`
        : `Valorisation historique indisponible au ${endDayStr.slice(8, 10)}/${endDayStr.slice(5, 7)}/${endDayStr.slice(0, 4)} : les mouvements et coûts d'achat historiques ne permettent pas une reconstitution rétroactive fiable. Aucun snapshot archivé pour ce mois.`,
    },
    review: {
      discrepancies,
      unresolvedCount: discrepancies.length,
    },
  };

  // ─── 14. SNAPSHOTS FORMATTÉS ────────────────────────────────────────────────
  const snapshots: MonthlyClosingSnapshotItem[] = savedSnapshots.map((s) => ({
    id: s.id,
    reference: s.reference,
    month: s.month,
    version: s.version,
    status: s.status as "DRAFT" | "FINAL" | "ARCHIVED",
    title: s.title,
    notes: s.notes,
    generatedAt: s.generatedAt.toISOString(),
    generatedBy: s.generatedBy,
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
    totals: JSON.parse(s.totalsJson),
    checklist: JSON.parse(s.checklistJson),
    discrepancies: s.discrepanciesJson ? JSON.parse(s.discrepanciesJson) : [],
  }));

  // ─── 15. LISTE DES MOIS DISPONIBLES DANS L'APPLICATION ───────────────────────
  const availableMonthsSet = new Set<string>();
  availableMonthsSet.add(currentMonth);

  allSales.forEach((s) => availableMonthsSet.add(getEffectiveDayStr(s.saleDate).slice(0, 7)));
  allPayments.forEach((p) => availableMonthsSet.add(getEffectiveDayStr(p.paymentDate).slice(0, 7)));
  allExpenses.forEach((e) => availableMonthsSet.add(getEffectiveDayStr(e.date).slice(0, 7)));
  allPurchases.forEach((p) => availableMonthsSet.add(getEffectiveDayStr(p.purchaseDate).slice(0, 7)));
  savedSnapshots.forEach((s) => availableMonthsSet.add(s.month));

  const availableMonths = Array.from(availableMonthsSet).sort().reverse();

  // ─── 16. INFORMATIONS DE PÉRIODE & ÉVALUATION DU WORKFLOW ───────────────────
  const periodRecord = await prisma.monthlyClosingPeriod.findUnique({
    where: { month },
  });

  const auditLogRecords = await prisma.monthlyClosingAuditLog.findMany({
    where: { month },
    orderBy: { createdAt: "desc" },
  });

  const rawStatus = (periodRecord?.status as ClosingWorkflowStatus) || "DRAFT";
  const isLocked = Boolean(periodRecord?.isLocked || rawStatus === "FINAL");

  // Évaluation exhaustive des 9 pré-conditions bloquantes
  const blockers: ClosingBlocker[] = [];

  // 1. Pointage complet de la checklist (aucun point en PENDING ou DISCREPANCY)
  const pendingChecklist = checklist.filter((c) => c.status === "PENDING");
  const discrepancyChecklist = checklist.filter((c) => c.status === "DISCREPANCY");
  if (pendingChecklist.length > 0) {
    blockers.push({
      code: "CHECKLIST_PENDING",
      category: "checklist",
      title: `${pendingChecklist.length} point(s) de contrôle non pointé(s)`,
      message: `Les contrôles suivants sont en attente de vérification : ${pendingChecklist.map((c) => c.label.replace(/^\d+\.\s*/, "")).join(", ")}.`,
      severity: "blocking",
      actionHint: "Renseignez le statut dans l'onglet 'Pointage & Contrôles'.",
    });
  }
  if (discrepancyChecklist.length > 0) {
    blockers.push({
      code: "CHECKLIST_DISCREPANCY",
      category: "checklist",
      title: `${discrepancyChecklist.length} point(s) de contrôle en anomalie / écart`,
      message: `Des écarts non justifiés subsistent : ${discrepancyChecklist.map((c) => c.label).join(", ")}.`,
      severity: "blocking",
      actionHint: "Régularisez ou documentez les écarts avant approbation.",
    });
  }

  // 2. Anomalies bloquantes dans l'audit automatique (severity = error)
  const blockingDiscrepancies = discrepancies.filter((d) => d.severity === "error");
  if (blockingDiscrepancies.length > 0) {
    blockers.push({
      code: "DISCREPANCIES_BLOCKING",
      category: "discrepancies",
      title: `${blockingDiscrepancies.length} anomalie(s) critique(s) non résolue(s)`,
      message: blockingDiscrepancies.map((d) => d.title).join(" ; "),
      severity: "blocking",
      actionHint: "Consultez l'onglet 'Anomalies & Écarts' et corrigez les erreurs.",
    });
  }

  // 3. Sessions de caisse : aucune session ouverte autorisée pour la clôture définitive
  if (openCount > 0) {
    blockers.push({
      code: "CASH_SESSION_OPEN",
      category: "cash_sessions",
      title: `${openCount} session(s) de caisse en cours non fermée(s)`,
      message: "Toutes les sessions de caisse appartenant au mois doivent être formellement fermées et comptées avant clôture définitive.",
      severity: "blocking",
      actionHint: "Effectuez la fermeture journalière de caisse dans le module Caisse.",
    });
  }

  // 4. Au moins un snapshot sauvegardé pour pouvoir figer la clôture
  if (savedSnapshots.length === 0) {
    blockers.push({
      code: "NO_SNAPSHOT",
      category: "snapshot",
      title: "Aucun instantané (snapshot) préalablement généré",
      message: "La clôture formelle requiert un instantané de référence préalablement généré, chiffré et contrôlé.",
      severity: "blocking",
      actionHint: "Cliquez sur 'Générer un instantané' pour figer une première version.",
    });
  }

  // Calcul des permissions de transition de workflow
  const hasBlockingBlockers = blockers.some((b) => b.severity === "blocking");

  const canMarkReady = (rawStatus === "DRAFT" || rawStatus === "REOPENED") && !hasBlockingBlockers;
  const canApprove = (rawStatus === "READY_FOR_APPROVAL" || rawStatus === "DRAFT") && !hasBlockingBlockers && savedSnapshots.length > 0;
  const canReopen = rawStatus === "FINAL";

  const periodInfo: MonthlyClosingPeriodInfo = {
    id: periodRecord?.id,
    month,
    status: rawStatus,
    isLocked,
    periodStart: boundaries.startDateUtc.toISOString(),
    periodEnd: boundaries.endDateUtc.toISOString(),
    finalSnapshotId: periodRecord?.finalSnapshotId,
    finalSnapshotRef: periodRecord?.finalSnapshotRef,
    approvedBy: periodRecord?.approvedBy,
    approvedAt: periodRecord?.approvedAt?.toISOString() || null,
    approvalNotes: periodRecord?.approvalNotes,
    backupConfirmedAt: periodRecord?.backupConfirmedAt?.toISOString() || null,
    blockers,
    canMarkReady,
    canApprove,
    canReopen,
  };

  const auditLogs: MonthlyClosingAuditLogItem[] = auditLogRecords.map((a) => ({
    id: a.id,
    periodId: a.periodId,
    month: a.month,
    action: a.action,
    fromStatus: a.fromStatus,
    toStatus: a.toStatus,
    operator: a.operator,
    reason: a.reason,
    snapshotRef: a.snapshotRef,
    version: a.version,
    metadataJson: a.metadataJson,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    month,
    monthLabel: boundaries.monthLabel,
    periodStartStr: boundaries.periodStartStr,
    periodEndStr: boundaries.periodEndStr,
    startDateUtc: boundaries.startDateUtc.toISOString(),
    endDateUtc: boundaries.endDateUtc.toISOString(),
    isCurrentMonth,
    shopSettings,
    totals,
    checklist,
    snapshots,
    availableMonths,
    periodInfo,
    auditLogs,
  };
}

// ─── ACTIONS DE GESTION DU POINTAGE (CHECKLIST) ───────────────────────────────

export async function updateChecklistItemAction(
  month: string,
  itemKey: string,
  status: ChecklistStatus,
  note?: string,
  operatorName: string = "Opérateur"
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!month || !itemKey) {
      return { success: false, error: "Paramètres manquants pour mettre à jour le contrôle." };
    }

    if (await isMonthLocked(month)) {
      return {
        success: false,
        error: `Impossible de modifier le pointage : le mois ${month} est définitivement clôturé et verrouillé. Demandez une réouverture pour toute correction.`,
      };
    }

    const validStatuses: ChecklistStatus[] = ["PENDING", "VALIDATED", "DISCREPANCY", "NOT_APPLICABLE"];
    if (!validStatuses.includes(status)) {
      return { success: false, error: "Statut de pointage non valide." };
    }

    const trimmedNote = note?.trim() || null;
    const now = new Date();

    await prisma.monthlyClosingChecklist.upsert({
      where: {
        month_itemKey: {
          month,
          itemKey,
        },
      },
      create: {
        month,
        itemKey,
        status,
        note: trimmedNote,
        checkedBy: operatorName,
        checkedAt: status !== "PENDING" ? now : null,
      },
      update: {
        status,
        note: trimmedNote,
        checkedBy: operatorName,
        checkedAt: status !== "PENDING" ? now : null,
      },
    });

    safeRevalidate("/closing/monthly");
    return { success: true, message: "Pointage enregistré avec succès." };
  } catch (err) {
    console.error("Erreur updateChecklistItemAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur inattendue." };
  }
}

// ─── ACTIONS DE GESTION DU SNAPSHOT MENSUEL (IMMUTABLE) ───────────────────────

export async function createMonthlyClosingSnapshotAction(
  month: string,
  status: "DRAFT" | "FINAL" = "DRAFT",
  title?: string,
  notes?: string,
  operatorName: string = "Opérateur"
): Promise<{ success: boolean; reference?: string; error?: string }> {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { success: false, error: "Format de mois invalide (attendu: YYYY-MM)." };
    }

    if (await isMonthLocked(month)) {
      return {
        success: false,
        error: `Impossible de générer un instantané : le mois ${month} est définitivement clôturé et verrouillé. Une réouverture exceptionnelle motivée est exigée pour toute modification.`,
      };
    }

    const data = await getMonthlyClosingData(month);
    const reference = await generateNextMonthlySnapshotReference(month);

    // Déterminer la version suivante
    const existingSnapshotsCount = await prisma.monthlyClosingSnapshot.count({
      where: { month },
    });
    const version = existingSnapshotsCount + 1;

    const boundaries = getMonthBoundaries(month);

    const snapshotTotals = {
      ...data.totals,
      stock: {
        ...data.totals.stock,
        valuationBasis: "SNAPSHOT" as const,
        valuationNotice: `Inventaire figé lors de la création du snapshot le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
      },
    };

    await prisma.monthlyClosingSnapshot.create({
      data: {
        reference,
        month,
        version,
        status: "DRAFT",
        title: title?.trim() || `Clôture Mensuelle ${boundaries.monthLabel} (v${version})`,
        notes: notes?.trim() || null,
        generatedAt: new Date(),
        generatedBy: operatorName,
        periodStart: boundaries.startDateUtc,
        periodEnd: boundaries.endDateUtc,
        totalsJson: JSON.stringify(snapshotTotals),
        checklistJson: JSON.stringify(data.checklist),
        discrepanciesJson: JSON.stringify(data.totals.review.discrepancies),
      },
    });

    safeRevalidate("/closing/monthly");
    return {
      success: true,
      reference,
    };
  } catch (err) {
    console.error("Erreur createMonthlyClosingSnapshotAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur lors de la création de l'instantané." };
  }
}

export async function updateSnapshotStatusAction(
  snapshotId: number,
  newStatus: "DRAFT" | "FINAL" | "ARCHIVED"
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const existing = await prisma.monthlyClosingSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!existing) {
      return { success: false, error: "Instantané introuvable." };
    }

    if (await isMonthLocked(existing.month)) {
      return {
        success: false,
        error: `Impossible de modifier le statut de l'instantané : le mois ${existing.month} est définitivement clôturé et verrouillé.`,
      };
    }

    // Le contenu figé (totalsJson, checklistJson) ne change JAMAIS : seul le statut d'archivage/validation évolue
    await prisma.monthlyClosingSnapshot.update({
      where: { id: snapshotId },
      data: { status: newStatus },
    });

    safeRevalidate("/closing/monthly");
    return { success: true, message: `Statut de l'instantané ${existing.reference} mis à jour : ${newStatus}.` };
  } catch (err) {
    console.error("Erreur updateSnapshotStatusAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur de mise à jour du statut." };
  }
}

// ─── ACTIONS DU WORKFLOW D'APPROBATION ET DE RÉOUVERTURE (PHASE 3) ────────────

export async function markPeriodReadyForApprovalAction(
  month: string,
  operatorName: string = "Opérateur"
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!month) return { success: false, error: "Mois manquant." };
    const data = await getMonthlyClosingData(month);

    if (data.periodInfo.status === "FINAL") {
      return { success: false, error: "Le mois est déjà finalisé et verrouillé." };
    }

    const blockingBlockers = data.periodInfo.blockers.filter((b) => b.severity === "blocking");
    if (blockingBlockers.length > 0) {
      return {
        success: false,
        error: `Impossible de marquer prêt pour approbation : ${blockingBlockers.map((b) => b.title).join(", ")}.`,
      };
    }

    const boundaries = getMonthBoundaries(month);

    const period = await prisma.monthlyClosingPeriod.upsert({
      where: { month },
      create: {
        month,
        status: "READY_FOR_APPROVAL",
        isLocked: false,
        periodStart: boundaries.startDateUtc,
        periodEnd: boundaries.endDateUtc,
      },
      update: {
        status: "READY_FOR_APPROVAL",
        isLocked: false,
      },
    });

    await prisma.monthlyClosingAuditLog.create({
      data: {
        periodId: period.id,
        month,
        action: "STATUS_CHANGE",
        fromStatus: data.periodInfo.status,
        toStatus: "READY_FOR_APPROVAL",
        operator: operatorName,
        reason: "Contrôles préalables validés ; période prête pour approbation",
      },
    });

    safeRevalidate("/closing/monthly");
    return { success: true, message: `Période ${data.monthLabel} marquée 'Prête pour approbation'.` };
  } catch (err) {
    console.error("Erreur markPeriodReadyForApprovalAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur inattendue." };
  }
}

export async function revertPeriodToDraftAction(
  month: string,
  operatorName: string = "Opérateur"
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!month) return { success: false, error: "Mois manquant." };
    const data = await getMonthlyClosingData(month);

    if (data.periodInfo.status === "FINAL") {
      return { success: false, error: "Le mois est déjà finalisé et verrouillé. Utilisez l'action de réouverture motivée." };
    }

    const boundaries = getMonthBoundaries(month);

    const period = await prisma.monthlyClosingPeriod.upsert({
      where: { month },
      create: {
        month,
        status: "DRAFT",
        isLocked: false,
        periodStart: boundaries.startDateUtc,
        periodEnd: boundaries.endDateUtc,
      },
      update: {
        status: "DRAFT",
        isLocked: false,
      },
    });

    await prisma.monthlyClosingAuditLog.create({
      data: {
        periodId: period.id,
        month,
        action: "STATUS_CHANGE",
        fromStatus: data.periodInfo.status,
        toStatus: "DRAFT",
        operator: operatorName,
        reason: "Retour en statut brouillon pour ajustements",
      },
    });

    safeRevalidate("/closing/monthly");
    return { success: true, message: `Période ${data.monthLabel} replacée en statut Brouillon.` };
  } catch (err) {
    console.error("Erreur revertPeriodToDraftAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur inattendue." };
  }
}

export async function approveAndLockMonthlyClosingAction(
  month: string,
  operatorName: string = "Opérateur",
  approvalNotes?: string,
  confirmBackup: boolean = false
): Promise<{ success: boolean; reference?: string; message?: string; error?: string }> {
  try {
    if (!month) return { success: false, error: "Mois manquant." };
    if (!confirmBackup) {
      return { success: false, error: "Vous devez confirmer avoir vérifié une sauvegarde récente de la base avant d'approuver définitivement la clôture." };
    }

    const data = await getMonthlyClosingData(month);

    if (data.periodInfo.status === "FINAL") {
      return { success: false, error: "Ce mois est déjà formellement approuvé et verrouillé." };
    }

    // Évaluation stricte de tous les bloqueurs
    const blockingBlockers = data.periodInfo.blockers.filter((b) => b.severity === "blocking");
    if (blockingBlockers.length > 0) {
      return {
        success: false,
        error: `Impossible d'approuver la clôture : conditions non remplies (${blockingBlockers.map((b) => b.title).join(", ")})`,
      };
    }

    if (data.snapshots.length === 0) {
      return {
        success: false,
        error: "Aucun instantané n'a été créé pour ce mois. Veuillez d'abord générer un instantané de clôture.",
      };
    }

    // Sélectionner le dernier instantané créé pour ce mois et le promouvoir en FINAL
    const latestSnapshot = data.snapshots[0];
    await prisma.monthlyClosingSnapshot.update({
      where: { id: latestSnapshot.id },
      data: { status: "FINAL" },
    });

    const now = new Date();
    const boundaries = getMonthBoundaries(month);

    const period = await prisma.monthlyClosingPeriod.upsert({
      where: { month },
      create: {
        month,
        status: "FINAL",
        isLocked: true,
        periodStart: boundaries.startDateUtc,
        periodEnd: boundaries.endDateUtc,
        finalSnapshotId: latestSnapshot.id,
        finalSnapshotRef: latestSnapshot.reference,
        approvedBy: operatorName,
        approvedAt: now,
        approvalNotes: approvalNotes?.trim() || null,
        backupConfirmedAt: now,
      },
      update: {
        status: "FINAL",
        isLocked: true,
        finalSnapshotId: latestSnapshot.id,
        finalSnapshotRef: latestSnapshot.reference,
        approvedBy: operatorName,
        approvedAt: now,
        approvalNotes: approvalNotes?.trim() || null,
        backupConfirmedAt: now,
      },
    });

    // Journal d'audit permanent
    await prisma.monthlyClosingAuditLog.create({
      data: {
        periodId: period.id,
        month,
        action: "APPROVED",
        fromStatus: data.periodInfo.status,
        toStatus: "FINAL",
        operator: operatorName,
        snapshotRef: latestSnapshot.reference,
        version: latestSnapshot.version,
        reason: approvalNotes?.trim() || "Clôture mensuelle approuvée formellement et période verrouillée",
      },
    });

    safeRevalidate("/closing/monthly");
    return {
      success: true,
      reference: latestSnapshot.reference,
      message: `Clôture de ${data.monthLabel} formellement approuvée et verrouillée (Réf: ${latestSnapshot.reference}).`,
    };
  } catch (err) {
    console.error("Erreur approveAndLockMonthlyClosingAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur inattendue." };
  }
}

export async function reopenMonthlyClosingAction(
  month: string,
  reason: string,
  operatorName: string = "Opérateur"
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!month) return { success: false, error: "Mois manquant." };
    if (!reason || reason.trim().length < 10) {
      return { success: false, error: "Le motif de réouverture est obligatoire et doit comporter au moins 10 caractères." };
    }
    if (!operatorName || !operatorName.trim()) {
      return { success: false, error: "L'identité de l'opérateur effectuant la réouverture est obligatoire." };
    }

    const data = await getMonthlyClosingData(month);

    if (data.periodInfo.status !== "FINAL") {
      return { success: false, error: "Seul un mois définitivement clôturé (FINAL) peut faire l'objet d'une réouverture." };
    }

    const boundaries = getMonthBoundaries(month);

    const period = await prisma.monthlyClosingPeriod.upsert({
      where: { month },
      create: {
        month,
        status: "REOPENED",
        isLocked: false,
        periodStart: boundaries.startDateUtc,
        periodEnd: boundaries.endDateUtc,
      },
      update: {
        status: "REOPENED",
        isLocked: false,
      },
    });

    // Journal d'audit permanent et inaltérable
    await prisma.monthlyClosingAuditLog.create({
      data: {
        periodId: period.id,
        month,
        action: "REOPENED",
        fromStatus: "FINAL",
        toStatus: "REOPENED",
        operator: operatorName.trim(),
        reason: reason.trim(),
        snapshotRef: data.periodInfo.finalSnapshotRef,
      },
    });

    safeRevalidate("/closing/monthly");
    return {
      success: true,
      message: `La période ${data.monthLabel} a été rouverte avec succès pour corrections. Une nouvelle version de snapshot et une réapprobation formelle seront exigées.`,
    };
  } catch (err) {
    console.error("Erreur reopenMonthlyClosingAction:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur inattendue." };
  }
}

