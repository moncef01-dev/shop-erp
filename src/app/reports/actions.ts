"use server";

import { prisma } from "@/lib/prisma";
import { getShopSettings, type ShopSettingsData } from "@/app/settings/actions";

export interface DateFilterRange {
  startDate?: string;
  endDate?: string;
  preset?: "today" | "week" | "month" | "last_month" | "year" | "all";
}

export interface CategoryExpenseBreakdown {
  category: string;
  categoryLabel: string;
  total: number;
  count: number;
}

export interface WarehouseValuation {
  locationId: number;
  locationName: string;
  locationCode: string;
  totalQuantity: number;
  valuationCost: number;
  valuationSelling: number;
  productCount: number;
}

export interface TopSellingProduct {
  productId: number;
  sku: string;
  name: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface LowStockAlertItem {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  stock: number;
  minStock: number;
  shortage: number;
  unit: string;
}

export interface ReportsData {
  settings: ShopSettingsData;
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };

  // 1. Chiffre d'Affaires & Ventes
  salesSummary: {
    invoicedRevenue: number;
    confirmedSalesCount: number;
    subtotalGross: number;
    totalDiscounts: number;
    totalDeliveryFees: number;
    collectedRevenue: number;
    customerDebts: number;
    collectionRate: number;
  };

  // 2. Marge Brute Estimée (avec transparence sur la couverture des coûts)
  marginAnalysis: {
    coveredSellingRevenue: number;
    coveredCostTotal: number;
    estimatedGrossMargin: number;
    estimatedMarginRate: number;
    uncoveredSellingRevenue: number;
    costCoveragePercentage: number;
    coveredItemsCount: number;
    uncoveredItemsCount: number;
    disclosureNote: string;
  };

  // 3. Achats & Dettes Fournisseurs
  purchasesSummary: {
    totalPurchases: number;
    purchasesCount: number;
    paidToSuppliers: number;
    supplierDebts: number;
    paymentRate: number;
  };

  // 4. Dépenses & Trésorerie
  cashSummary: {
    totalExpenses: number;
    expensesCount: number;
    expensesByCategory: CategoryExpenseBreakdown[];
    cashCollections: number;
    nonCashCollections: number;
    totalCashReceived: number;
    supplierCashPaid: number;
    netOperatingCash: number;
  };

  // 5. Stocks & Valorisation par Dépôt
  stockValuation: {
    warehouses: WarehouseValuation[];
    globalTotalQuantity: number;
    globalValuationCost: number;
    globalValuationSelling: number;
  };

  // 6. Alertes et Mouvements
  lowStockAlerts: LowStockAlertItem[];
  topSellingProducts: TopSellingProduct[];
}

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
};

export async function getReportsData(filter?: DateFilterRange): Promise<ReportsData> {
  const settings = await getShopSettings();

  // Déterminer la plage de dates
  let start: Date;
  let end: Date = new Date();
  end.setHours(23, 59, 59, 999);

  const preset = filter?.preset || "month";
  let periodLabel = "Ce mois-ci";

  if (filter?.startDate && filter?.endDate) {
    start = new Date(filter.startDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(filter.endDate);
    end.setHours(23, 59, 59, 999);
    periodLabel = `Du ${start.toLocaleDateString("fr-DZ")} au ${end.toLocaleDateString("fr-DZ")}`;
  } else if (preset === "today") {
    start = new Date();
    start.setHours(0, 0, 0, 0);
    periodLabel = "Aujourd'hui";
  } else if (preset === "week") {
    start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    periodLabel = "7 derniers jours";
  } else if (preset === "last_month") {
    start = new Date();
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const lastDayPrevMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    end = lastDayPrevMonth;
    periodLabel = "Mois précédent";
  } else if (preset === "year") {
    start = new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0);
    periodLabel = `Année ${new Date().getFullYear()}`;
  } else if (preset === "all") {
    start = new Date(2020, 0, 1, 0, 0, 0, 0);
    periodLabel = "Toutes les dates";
  } else {
    // Ce mois-ci
    start = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0);
    periodLabel = "Ce mois-ci";
  }

  // 1. Requêtes parallèles vers la base de données
  const [
    sales,
    purchases,
    expenses,
    payments,
    products,
    locations,
  ] = await Promise.all([
    // Ventes confirmées dans la période
    prisma.sales.findMany({
      where: {
        status: "confirmed",
        saleDate: { gte: start, lte: end },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, costPrice: true } },
          },
        },
        payments: true,
      },
    }),

    // Achats fournisseurs dans la période
    prisma.purchase.findMany({
      where: {
        status: { not: "cancelled" },
        purchaseDate: { gte: start, lte: end },
      },
      include: {
        payments: true,
      },
    }),

    // Dépenses dans la période
    prisma.expense.findMany({
      where: {
        date: { gte: start, lte: end },
      },
    }),

    // Paiements dans la période
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: start, lte: end },
        status: "completed",
      },
    }),

    // Produits et stocks actuels
    prisma.product.findMany({
      include: {
        categoryRef: { select: { name: true } },
        stocks: {
          include: {
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),

    // Emplacements / Dépôts
    prisma.location.findMany({
      where: { isActive: true },
    }),
  ]);

  // ─── 2. CALCULS VENTES & CHIFFRE D'AFFAIRES ────────────────────────────────
  let invoicedRevenue = 0;
  let subtotalGross = 0;
  let totalDiscounts = 0;
  let totalDeliveryFees = 0;
  let collectedRevenue = 0;

  // Calcul marge prudente
  let coveredSellingRevenue = 0;
  let coveredCostTotal = 0;
  let uncoveredSellingRevenue = 0;
  let coveredItemsCount = 0;
  let uncoveredItemsCount = 0;

  // Suivi des meilleures ventes
  const topSellingMap = new Map<number, { sku: string; name: string; qty: number; revenue: number }>();

  for (const s of sales) {
    invoicedRevenue += s.totalAmount;
    subtotalGross += s.subtotal;
    totalDiscounts += s.discount;
    totalDeliveryFees += s.deliveryFee;
    collectedRevenue += s.paidAmount;

    for (const it of s.items) {
      const pid = it.productId;
      const cur = topSellingMap.get(pid) || {
        sku: it.product.sku,
        name: it.product.name,
        qty: 0,
        revenue: 0,
      };
      cur.qty += it.quantity;
      cur.revenue += it.subtotal;
      topSellingMap.set(pid, cur);

      // Marge brute : distinction rigoureuse des lignes documentées
      const cost = it.product.costPrice;
      if (cost !== null && cost !== undefined && cost > 0) {
        coveredItemsCount += it.quantity;
        coveredSellingRevenue += it.subtotal;
        coveredCostTotal += it.quantity * cost;
      } else {
        uncoveredItemsCount += it.quantity;
        uncoveredSellingRevenue += it.subtotal;
      }
    }
  }

  const customerDebts = Math.max(0, invoicedRevenue - collectedRevenue);
  const collectionRate = invoicedRevenue > 0 ? (collectedRevenue / invoicedRevenue) * 100 : 0;

  const totalSellingAnalyzed = coveredSellingRevenue + uncoveredSellingRevenue;
  const costCoveragePercentage =
    totalSellingAnalyzed > 0 ? (coveredSellingRevenue / totalSellingAnalyzed) * 100 : 100;
  const estimatedGrossMargin = coveredSellingRevenue - coveredCostTotal;
  const estimatedMarginRate =
    coveredSellingRevenue > 0 ? (estimatedGrossMargin / coveredSellingRevenue) * 100 : 0;

  const disclosureNote =
    costCoveragePercentage < 100
      ? `Estimation calculée sur ${costCoveragePercentage.toFixed(1)}% du chiffre d'affaires vendu (${coveredItemsCount} article(s) avec coût d'achat renseigné). Les articles sans prix de revient (${uncoveredItemsCount} pièce(s)) sont exclus du calcul pour préserver la rigueur comptable.`
      : "100% des articles vendus disposent d'un coût de revient documenté.";

  // ─── 3. ACHATS & FOURNISSEURS ──────────────────────────────────────────────
  let totalPurchases = 0;
  let paidToSuppliers = 0;

  for (const p of purchases) {
    totalPurchases += p.totalAmount;
    paidToSuppliers += p.paidAmount;
  }

  const supplierDebts = Math.max(0, totalPurchases - paidToSuppliers);
  const supplierPaymentRate =
    totalPurchases > 0 ? (paidToSuppliers / totalPurchases) * 100 : 0;

  // ─── 4. DÉPENSES & RAPPROCHEMENT TRÉSORERIE ────────────────────────────────
  let totalExpenses = 0;
  const expenseCatMap = new Map<string, { total: number; count: number }>();

  for (const ex of expenses) {
    if (ex.type === "expense") {
      totalExpenses += ex.amount;
      const cat = ex.category || "other";
      const cur = expenseCatMap.get(cat) || { total: 0, count: 0 };
      cur.total += ex.amount;
      cur.count += 1;
      expenseCatMap.set(cat, cur);
    }
  }

  const expensesByCategory: CategoryExpenseBreakdown[] = Array.from(expenseCatMap.entries()).map(
    ([cat, data]) => ({
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat] || cat,
      total: data.total,
      count: data.count,
    })
  );
  expensesByCategory.sort((a, b) => b.total - a.total);

  // Rapprochement des flux d'espèces vs non-espèces
  let cashCollections = 0;
  let nonCashCollections = 0;
  let supplierCashPaid = 0;

  for (const py of payments) {
    if (py.saleId) {
      if (py.method === "cash") {
        cashCollections += py.amount;
      } else {
        nonCashCollections += py.amount;
      }
    } else if (py.purchaseId) {
      if (py.method === "cash") {
        supplierCashPaid += py.amount;
      }
    }
  }

  const totalCashReceived = cashCollections + nonCashCollections;
  // Trésorerie nette d'exploitation en espèces
  const netOperatingCash = cashCollections - totalExpenses - supplierCashPaid;

  // ─── 5. VALORISATION DES STOCKS PAR DÉPÔT ─────────────────────────────────
  const warehouseMap = new Map<number, WarehouseValuation>();
  for (const loc of locations) {
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

  let globalTotalQuantity = 0;
  let globalValuationCost = 0;
  let globalValuationSelling = 0;
  const lowStockAlerts: LowStockAlertItem[] = [];

  for (const prod of products) {
    globalTotalQuantity += prod.stock;
    const cost = prod.costPrice ?? 0;
    const sell = prod.sellingPrice ?? 0;
    globalValuationCost += prod.stock * cost;
    globalValuationSelling += prod.stock * sell;

    // Alerte stock
    if (prod.stock <= prod.minStock) {
      lowStockAlerts.push({
        id: prod.id,
        sku: prod.sku,
        name: prod.name,
        category: prod.categoryRef?.name || prod.category,
        stock: prod.stock,
        minStock: prod.minStock,
        shortage: Math.max(0, prod.minStock - prod.stock),
        unit: prod.unit,
      });
    }

    // Répartition par dépôt
    for (const ps of prod.stocks) {
      const wh = warehouseMap.get(ps.locationId);
      if (wh) {
        wh.totalQuantity += ps.quantity;
        wh.valuationSelling += ps.quantity * sell;
        wh.valuationCost += ps.quantity * cost;
        if (ps.quantity > 0) wh.productCount += 1;
      }
    }
  }

  const warehouses = Array.from(warehouseMap.values());
  lowStockAlerts.sort((a, b) => b.shortage - a.shortage);

  // Top produits
  const topSellingProducts: TopSellingProduct[] = Array.from(topSellingMap.entries())
    .map(([pid, val]) => ({
      productId: pid,
      sku: val.sku,
      name: val.name,
      quantitySold: val.qty,
      totalRevenue: val.revenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);

  return {
    settings,
    period: {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: periodLabel,
    },
    salesSummary: {
      invoicedRevenue,
      confirmedSalesCount: sales.length,
      subtotalGross,
      totalDiscounts,
      totalDeliveryFees,
      collectedRevenue,
      customerDebts,
      collectionRate,
    },
    marginAnalysis: {
      coveredSellingRevenue,
      coveredCostTotal,
      estimatedGrossMargin,
      estimatedMarginRate,
      uncoveredSellingRevenue,
      costCoveragePercentage,
      coveredItemsCount,
      uncoveredItemsCount,
      disclosureNote,
    },
    purchasesSummary: {
      totalPurchases,
      purchasesCount: purchases.length,
      paidToSuppliers,
      supplierDebts,
      paymentRate: supplierPaymentRate,
    },
    cashSummary: {
      totalExpenses,
      expensesCount: expenses.filter((e) => e.type === "expense").length,
      expensesByCategory,
      cashCollections,
      nonCashCollections,
      totalCashReceived,
      supplierCashPaid,
      netOperatingCash,
    },
    stockValuation: {
      warehouses,
      globalTotalQuantity,
      globalValuationCost,
      globalValuationSelling,
    },
    lowStockAlerts,
    topSellingProducts,
  };
}
