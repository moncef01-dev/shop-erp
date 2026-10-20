"use server";

import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/formatters";

export type PeriodPreset = "today" | "yesterday" | "7d" | "month" | "custom";

export interface PeriodFilter {
  preset: PeriodPreset;
  startDate?: string;
  endDate?: string;
}

export interface KpiComparison {
  value: number;
  previousValue: number;
  percentageChange: number | null; // null if previous was 0
  isPositiveGood?: boolean;
}

export interface ChartDataPoint {
  label: string; // e.g. "15/10" or "10h"
  dateKey: string; // ISO date YYYY-MM-DD
  invoicedSales: number;
  collectedCash: number;
}

export interface OperationalAlert {
  id: string;
  type: "warning" | "danger" | "info" | "success";
  title: string;
  message: string;
  href: string;
  linkText: string;
  badge?: string;
}

export interface RecentActivityItem {
  id: string;
  date: string;
  type: "sale" | "payment" | "expense" | "purchase";
  typeLabel: string;
  reference: string;
  party: string;
  amount: number;
  isPositive: boolean;
  status: string;
  statusLabel: string;
  href: string;
}

export interface DashboardData {
  period: {
    preset: PeriodPreset;
    startDate: string;
    endDate: string;
    label: string;
  };
  kpis: {
    // 1. Ventes facturées
    invoicedRevenue: {
      current: number;
      previous: number;
      percentageChange: number | null;
      salesCount: number;
    };
    // 2. Encaissements réels
    collectedRevenue: {
      current: number;
      previous: number;
      percentageChange: number | null;
      paymentsCount: number;
    };
    // 3. Dépenses d'exploitation
    expenses: {
      current: number;
      previous: number;
      percentageChange: number | null;
      expensesCount: number;
    };
    // 4. Créances clients (solde global restant dû)
    customerDebts: {
      totalOutstanding: number;
      unpaidInvoicesCount: number;
    };
    // 5. Caisse physique et statut session
    cashSession: {
      isOpen: boolean;
      sessionRef?: string;
      openedAt?: string;
      openingAmount: number;
      theoreticalCash: number;
      countedCash: number | null;
      discrepancy: number | null;
      statusLabel: string;
      notes?: string | null;
    };
    // 6. Alertes Stock
    stock: {
      ruptureCount: number;
      lowStockCount: number;
      totalCriticalCount: number;
      totalProductsCount: number;
    };
  };
  chartData: ChartDataPoint[];
  alerts: OperationalAlert[];
  recentActivity: RecentActivityItem[];
}

function computeDateRange(filter: PeriodFilter): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  label: string;
} {
  const now = new Date();
  let start: Date;
  let end: Date = new Date();
  let prevStart: Date;
  let prevEnd: Date;
  let label = "Ce mois-ci";

  switch (filter.preset) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      // Période précédente: hier
      prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 1);
      label = "Aujourd'hui";
      break;
    }
    case "yesterday": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      // Période précédente: avant-hier
      prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(end);
      prevEnd.setDate(prevEnd.getDate() - 1);
      label = "Hier";
      break;
    }
    case "7d": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      // Période précédente: 7 jours précédents
      const durationMs = end.getTime() - start.getTime();
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - durationMs);
      label = "7 derniers jours";
      break;
    }
    case "custom": {
      if (filter.startDate && filter.endDate) {
        start = new Date(filter.startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(filter.endDate);
        end.setHours(23, 59, 59, 999);
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      }
      const durationMs = Math.max(86400000, end.getTime() - start.getTime());
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - durationMs);
      label = `Du ${start.toLocaleDateString("fr-DZ")} au ${end.toLocaleDateString("fr-DZ")}`;
      break;
    }
    case "month":
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      // Période précédente: mois précédent du 1er au même jour
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const prevEndDay = Math.min(now.getDate(), daysInPrevMonth);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, prevEndDay, 23, 59, 59, 999);
      label = "Ce mois-ci";
      break;
    }
  }

  return { start, end, prevStart, prevEnd, label };
}

function calculatePercentChange(current: number, previous: number): number | null {
  if (previous <= 0) {
    if (current > 0) return 100;
    return null;
  }
  const diff = ((current - previous) / previous) * 100;
  return Math.round(diff * 10) / 10;
}

export async function getDashboardData(
  filter: PeriodFilter = { preset: "month" }
): Promise<DashboardData> {
  const { start, end, prevStart, prevEnd, label } = computeDateRange(filter);

  // 1. Exécution des requêtes parallèles vers SQLite
  const [
    // Ventes courantes
    currentSales,
    // Ventes période précédente
    prevSales,
    // Règlements courants
    currentPayments,
    // Règlements période précédente
    prevPayments,
    // Dépenses courantes
    currentExpenses,
    // Dépenses période précédente
    prevExpenses,
    // Toutes les ventes actives avec créances (non annulées, solde > 0)
    allUnpaidSales,
    // Session de caisse active
    activeSession,
    // Dernière session fermée si aucune active
    lastClosedSession,
    // Produits pour alertes stock
    allProducts,
    // Achats récents pour l'activité
    recentPurchases,
    // Ventes annulées récentes pour alerte opérationnelle
    recentCancelledSales,
  ] = await Promise.all([
    // Ventes confirmées de la période
    prisma.sales.findMany({
      where: {
        status: "confirmed",
        saleDate: { gte: start, lte: end },
      },
      include: {
        customer: { select: { name: true } },
      },
      orderBy: { saleDate: "desc" },
    }),

    // Ventes période précédente
    prisma.sales.findMany({
      where: {
        status: "confirmed",
        saleDate: { gte: prevStart, lte: prevEnd },
      },
      select: { totalAmount: true },
    }),

    // Règlements encaissés période courante
    prisma.payment.findMany({
      where: {
        status: "completed",
        paymentDate: { gte: start, lte: end },
      },
      include: {
        sale: {
          select: {
            reference: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { paymentDate: "desc" },
    }),

    // Règlements période précédente
    prisma.payment.findMany({
      where: {
        status: "completed",
        paymentDate: { gte: prevStart, lte: prevEnd },
      },
      select: { amount: true, saleId: true, purchaseId: true },
    }),

    // Dépenses période courante
    prisma.expense.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      orderBy: { date: "desc" },
    }),

    // Dépenses période précédente
    prisma.expense.findMany({
      where: {
        date: { gte: prevStart, lte: prevEnd },
      },
      select: { amount: true, type: true },
    }),

    // Créances : factures non annulées avec solde dû
    prisma.sales.findMany({
      where: {
        status: { not: "cancelled" },
        paymentStatus: { in: ["unpaid", "partial"] },
      },
      select: {
        id: true,
        reference: true,
        totalAmount: true,
        paidAmount: true,
        customer: { select: { name: true } },
      },
    }),

    // Session active
    prisma.cashSession.findFirst({
      where: { status: "open" },
    }),

    // Dernière session fermée
    prisma.cashSession.findFirst({
      where: { status: "closed" },
      orderBy: { closedAt: "desc" },
    }),

    // Produits & catalogue
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        stock: true,
        minStock: true,
        unit: true,
      },
    }),

    // Achats récents
    prisma.purchase.findMany({
      where: { status: { not: "cancelled" } },
      take: 5,
      orderBy: { purchaseDate: "desc" },
      include: {
        supplier: { select: { name: true } },
      },
    }),

    // Annulations récentes
    prisma.sales.findMany({
      where: {
        status: "cancelled",
        updatedAt: { gte: start, lte: end },
      },
      select: { id: true, reference: true, totalAmount: true },
      take: 5,
    }),
  ]);

  // ─── 2. CALCULS KPI FINANCIERS ET OPÉRATIONNELS ──────────────────────────────

  // 2.1 Ventes facturées
  const currentRevenue = roundMoney(currentSales.reduce((acc, s) => acc + s.totalAmount, 0));
  const prevRevenue = roundMoney(prevSales.reduce((acc, s) => acc + s.totalAmount, 0));
  const revenuePercentChange = calculatePercentChange(currentRevenue, prevRevenue);

  // 2.2 Encaissements réels (ventes + acomptes clients)
  const currentCollected = roundMoney(
    currentPayments
      .filter((p) => p.saleId !== null || !p.purchaseId)
      .reduce((acc, p) => acc + p.amount, 0)
  );
  const prevCollected = roundMoney(
    prevPayments
      .filter((p) => p.saleId !== null || !p.purchaseId)
      .reduce((acc, p) => acc + p.amount, 0)
  );
  const collectedPercentChange = calculatePercentChange(currentCollected, prevCollected);

  // 2.3 Dépenses d'exploitation (charges réelles, hors apport/recette exceptionnelle)
  const operationalExpenses = currentExpenses.filter((e) => e.type === "expense");
  const currentExpensesTotal = roundMoney(operationalExpenses.reduce((acc, e) => acc + e.amount, 0));
  const prevExpensesTotal = roundMoney(
    prevExpenses.filter((e) => e.type === "expense").reduce((acc, e) => acc + e.amount, 0)
  );
  const expensesPercentChange = calculatePercentChange(currentExpensesTotal, prevExpensesTotal);

  // 2.4 Créances clients (Global)
  const totalOutstandingCredit = roundMoney(
    allUnpaidSales.reduce((acc, s) => acc + Math.max(0, s.totalAmount - s.paidAmount), 0)
  );

  // 2.5 Caisse physique & Calcul autoritaire
  let cashTheoretical = 0;
  let cashOpening = 0;
  let cashCounted: number | null = null;
  let cashDiscrepancy: number | null = null;
  let isSessionOpen = false;
  let sessionRef: string | undefined;
  let openedAtStr: string | undefined;
  let statusLabel = "Caisse clôturée";
  let sessionNotes: string | null = null;

  if (activeSession) {
    isSessionOpen = true;
    sessionRef = activeSession.reference;
    openedAtStr = activeSession.openedAt.toISOString();
    cashOpening = activeSession.openingAmount;
    statusLabel = `Session active (${activeSession.reference})`;
    sessionNotes = activeSession.openingNotes;

    // Calcul autoritaire identique à cash/actions.ts
    // Encaissements espèces liés à la session ou sans session depuis l'ouverture
    const now = new Date();
    const sessionPayments = await prisma.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        OR: [
          { sessionId: activeSession.id },
          { sessionId: null, paymentDate: { gte: activeSession.openedAt, lte: now } },
        ],
      },
      select: { amount: true, saleId: true, purchaseId: true },
    });

    const cashInSales = sessionPayments
      .filter((p) => p.saleId !== null)
      .reduce((acc, p) => acc + p.amount, 0);
    const cashOutPurchases = sessionPayments
      .filter((p) => p.purchaseId !== null)
      .reduce((acc, p) => acc + p.amount, 0);

    const sessionExpenses = await prisma.expense.findMany({
      where: {
        method: "cash",
        OR: [
          { sessionId: activeSession.id },
          { sessionId: null, date: { gte: activeSession.openedAt, lte: now } },
        ],
      },
      select: { amount: true, type: true },
    });

    const cashInOther = sessionExpenses
      .filter((e) => e.type === "income")
      .reduce((acc, e) => acc + e.amount, 0);
    const cashOutExpenses = sessionExpenses
      .filter((e) => e.type === "expense")
      .reduce((acc, e) => acc + e.amount, 0);

    cashTheoretical = roundMoney(
      activeSession.openingAmount + (cashInSales + cashInOther) - (cashOutPurchases + cashOutExpenses)
    );
    // Pour une session ouverte, aucun comptage de clôture n'est encore saisi
    cashCounted = null;
    cashDiscrepancy = null;
  } else if (lastClosedSession) {
    sessionRef = lastClosedSession.reference;
    cashOpening = lastClosedSession.openingAmount;
    cashTheoretical = roundMoney(lastClosedSession.theoreticalAmount ?? 0);
    cashCounted = lastClosedSession.closingAmount !== null ? roundMoney(lastClosedSession.closingAmount) : null;
    cashDiscrepancy = lastClosedSession.difference !== null ? roundMoney(lastClosedSession.difference) : null;
    statusLabel = `Dernière clôture (${lastClosedSession.reference})`;
    sessionNotes = lastClosedSession.closingNotes;
  }

  // 2.6 Alertes stock
  const outOfStockItems = allProducts.filter((p) => p.stock === 0);
  const lowStockItems = allProducts.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const totalCriticalCount = outOfStockItems.length + lowStockItems.length;

  // ─── 3. CONSTRUCTION DES POINTS DU GRAPHIQUE ────────────────────────────────
  // On découpe la période en points chronologiques lisibles
  const chartMap = new Map<string, { label: string; invoiced: number; collected: number }>();

  // Pré-remplir les jalons selon la durée
  const msInDay = 86400000;
  const numDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msInDay));

  if (filter.preset === "today" || filter.preset === "yesterday") {
    // Par blocs d'heures (8h, 10h, 12h, 14h, 16h, 18h, 20h)
    const hours = [8, 10, 12, 14, 16, 18, 20];
    for (const h of hours) {
      const key = `${String(h).padStart(2, "0")}:00`;
      chartMap.set(key, { label: key, invoiced: 0, collected: 0 });
    }

    for (const s of currentSales) {
      const h = new Date(s.saleDate).getHours();
      // trouver l'intervalle le plus proche
      const bucket = hours.reduce((prev, curr) => (Math.abs(curr - h) < Math.abs(prev - h) ? curr : prev));
      const key = `${String(bucket).padStart(2, "0")}:00`;
      const cur = chartMap.get(key);
      if (cur) cur.invoiced += s.totalAmount;
    }

    for (const p of currentPayments) {
      if (p.saleId !== null || !p.purchaseId) {
        const h = new Date(p.paymentDate).getHours();
        const bucket = hours.reduce((prev, curr) => (Math.abs(curr - h) < Math.abs(prev - h) ? curr : prev));
        const key = `${String(bucket).padStart(2, "0")}:00`;
        const cur = chartMap.get(key);
        if (cur) cur.collected += p.amount;
      }
    }
  } else {
    // Par jours (ex: 7 derniers jours ou ce mois-ci)
    const temp = new Date(start);
    while (temp <= end) {
      const dateKey = temp.toISOString().slice(0, 10);
      const label = `${temp.getDate()} ${temp.toLocaleDateString("fr-DZ", { month: "short" })}`;
      chartMap.set(dateKey, { label, invoiced: 0, collected: 0 });
      temp.setDate(temp.getDate() + 1);
    }

    for (const s of currentSales) {
      const dateKey = new Date(s.saleDate).toISOString().slice(0, 10);
      const cur = chartMap.get(dateKey);
      if (cur) cur.invoiced += s.totalAmount;
    }

    for (const p of currentPayments) {
      if (p.saleId !== null || !p.purchaseId) {
        const dateKey = new Date(p.paymentDate).toISOString().slice(0, 10);
        const cur = chartMap.get(dateKey);
        if (cur) cur.collected += p.amount;
      }
    }
  }

  const chartData: ChartDataPoint[] = Array.from(chartMap.entries()).map(([key, data]) => ({
    label: data.label,
    dateKey: key,
    invoicedSales: roundMoney(data.invoiced),
    collectedCash: roundMoney(data.collected),
  }));

  // ─── 4. ALERTES OPÉRATIONNELLES SYNTHÉTIQUES & ACTIONNABLES ─────────────────
  const alerts: OperationalAlert[] = [];

  // Alerte 1: Factures impayées
  if (allUnpaidSales.length > 0) {
    alerts.push({
      id: "unpaid-invoices",
      type: "warning",
      title: "Créances clients en cours",
      message: `${allUnpaidSales.length} facture(s) en attente de solde (${totalOutstandingCredit.toLocaleString("fr-DZ")} DA à encaisser).`,
      href: "/sales",
      linkText: "Voir les créances",
      badge: `${totalOutstandingCredit.toLocaleString("fr-DZ")} DA`,
    });
  }

  // Alerte 2: Ruptures et alertes de stock
  if (totalCriticalCount > 0) {
    alerts.push({
      id: "stock-critical",
      type: outOfStockItems.length > 0 ? "danger" : "warning",
      title: "Alerte réapprovisionnement stock",
      message: `${outOfStockItems.length} meuble(s) en rupture totale et ${lowStockItems.length} sous le seuil d'alerte.`,
      href: "/products",
      linkText: "Gérer le stock",
      badge: `${totalCriticalCount} article(s)`,
    });
  }

  // Alerte 3: Statut session de caisse
  if (!activeSession) {
    alerts.push({
      id: "cash-closed",
      type: "info",
      title: "Aucune session de caisse active",
      message: "Le tiroir de caisse est actuellement fermé. Ouvrez une session pour enregistrer les encaissements en espèces.",
      href: "/cash",
      linkText: "Ouvrir la caisse",
    });
  } else {
    // Vérifier si la session est ouverte depuis un jour antérieur
    const sessionOpenDate = new Date(activeSession.openedAt);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (sessionOpenDate < todayStart) {
      alerts.push({
        id: "cash-unclosed-yesterday",
        type: "warning",
        title: "Session de caisse non clôturée",
        message: `La session ${activeSession.reference} est ouverte depuis le ${sessionOpenDate.toLocaleDateString("fr-DZ")}. Pensez à procéder à la clôture journalière.`,
        href: "/cash",
        linkText: "Clôturer la session",
      });
    }
  }

  // Alerte 4: Écart de caisse sur la dernière session
  if (lastClosedSession && lastClosedSession.difference !== null && Math.abs(lastClosedSession.difference) > 0) {
    const isDeficit = lastClosedSession.difference < 0;
    alerts.push({
      id: "cash-discrepancy",
      type: "danger",
      title: `Écart de caisse détecté (${lastClosedSession.reference})`,
      message: `Un écart de ${isDeficit ? "" : "+"}${lastClosedSession.difference.toLocaleString("fr-DZ")} DA a été constaté lors de la dernière clôture.`,
      href: "/cash",
      linkText: "Consulter la clôture",
      badge: `${lastClosedSession.difference > 0 ? "+" : ""}${lastClosedSession.difference.toLocaleString("fr-DZ")} DA`,
    });
  }

  // Alerte 5: Factures annulées
  if (recentCancelledSales.length > 0) {
    alerts.push({
      id: "sales-cancelled",
      type: "info",
      title: "Annulations sur la période",
      message: `${recentCancelledSales.length} vente(s) annulée(s). Les stocks et soldes ont été automatiquement réintégrés.`,
      href: "/sales",
      linkText: "Vérifier le journal",
    });
  }

  // ─── 5. DERNIÈRES OPÉRATIONS MULTI-MODULES SANS DOUBLONS ────────────────────
  const recentActivity: RecentActivityItem[] = [];

  // Ventes
  for (const s of currentSales.slice(0, 4)) {
    recentActivity.push({
      id: `sale-${s.id}`,
      date: s.saleDate.toISOString(),
      type: "sale",
      typeLabel: "Vente Meuble",
      reference: s.reference,
      party: s.customer?.name || "Client Passager / Comptoir",
      amount: s.totalAmount,
      isPositive: true,
      status: s.paymentStatus,
      statusLabel: s.paymentStatus === "paid" ? "Payée" : s.paymentStatus === "partial" ? "Acompte" : "Non payée",
      href: "/sales",
    });
  }

  // Règlements
  for (const p of currentPayments.slice(0, 4)) {
    recentActivity.push({
      id: `pay-${p.id}`,
      date: p.paymentDate.toISOString(),
      type: "payment",
      typeLabel: "Règlement Client",
      reference: p.reference || `PAY-${p.id}`,
      party: p.sale?.customer?.name || (p.sale ? `Vente ${p.sale.reference}` : "Règlement direct"),
      amount: p.amount,
      isPositive: true,
      status: "completed",
      statusLabel: "Encaissé",
      href: "/cash",
    });
  }

  // Dépenses
  for (const e of currentExpenses.slice(0, 3)) {
    recentActivity.push({
      id: `exp-${e.id}`,
      date: e.date.toISOString(),
      type: "expense",
      typeLabel: e.type === "income" ? "Recette exceptionnelle" : "Dépense / Charge",
      reference: e.reference || `DEP-${e.id}`,
      party: e.beneficiary || e.description,
      amount: e.amount,
      isPositive: e.type === "income",
      status: "paid",
      statusLabel: e.method === "cash" ? "Espèces" : "Bancaire",
      href: "/cash",
    });
  }

  // Tri chronologique décroissant et limite à 6-8 opérations
  recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const finalRecentActivity = recentActivity.slice(0, 7);

  return {
    period: {
      preset: filter.preset,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label,
    },
    kpis: {
      invoicedRevenue: {
        current: currentRevenue,
        previous: prevRevenue,
        percentageChange: revenuePercentChange,
        salesCount: currentSales.length,
      },
      collectedRevenue: {
        current: currentCollected,
        previous: prevCollected,
        percentageChange: collectedPercentChange,
        paymentsCount: currentPayments.length,
      },
      expenses: {
        current: currentExpensesTotal,
        previous: prevExpensesTotal,
        percentageChange: expensesPercentChange,
        expensesCount: operationalExpenses.length,
      },
      customerDebts: {
        totalOutstanding: totalOutstandingCredit,
        unpaidInvoicesCount: allUnpaidSales.length,
      },
      cashSession: {
        isOpen: isSessionOpen,
        sessionRef,
        openedAt: openedAtStr,
        openingAmount: cashOpening,
        theoreticalCash: cashTheoretical,
        countedCash: cashCounted,
        discrepancy: cashDiscrepancy,
        statusLabel,
        notes: sessionNotes,
      },
      stock: {
        ruptureCount: outOfStockItems.length,
        lowStockCount: lowStockItems.length,
        totalCriticalCount,
        totalProductsCount: allProducts.length,
      },
    },
    chartData,
    alerts,
    recentActivity: finalRecentActivity,
  };
}
