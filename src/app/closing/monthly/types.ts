export type ChecklistStatus = "PENDING" | "VALIDATED" | "DISCREPANCY" | "NOT_APPLICABLE";

export interface MonthlyClosingChecklistItem {
  key: string;
  label: string;
  description: string;
  category: "caisse" | "tresorerie" | "ventes" | "achats" | "charges" | "stock" | "audit";
  status: ChecklistStatus;
  note: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
}

export interface ExpenseCategoryBreakdown {
  category: string;
  label: string;
  total: number;
  count: number;
}

export interface TreasuryAccountMonthlySummary {
  id: number;
  name: string;
  code: string;
  type: string;
  openingBalance: number;
  transfersIn: number;
  transfersOut: number;
  otherInflows: number;
  otherOutflows: number;
  closingBalance: number;
}

export interface WarehouseStockSummary {
  locationId: number;
  locationName: string;
  locationCode: string;
  totalQuantity: number;
  valuationCost: number;
  valuationSelling: number;
  productCount: number;
}

export interface DiscrepancyReviewItem {
  id: string;
  type: "cash_session_difference" | "open_cash_session" | "negative_balance" | "unpaid_overdue" | "missing_cost" | "audit_note";
  severity: "error" | "warning" | "info";
  title: string;
  details: string;
  reference?: string;
  amount?: number;
}

export interface MonthlyClosingTotals {
  // 1. Ventes facturées du mois
  sales: {
    totalInvoiced: number; // Factures confirmées nettes
    confirmedCount: number;
    subtotal: number;
    discounts: number;
    deliveryFees: number; // Frais inclus dans la facturation
    deliveryFeesIncluded: number;
    deliveryFeesExcluded: number;
    deliveryFeesTotal: number;
    costOfGoodsSoldEstimated: number;
    grossMarginEstimated: number;
    draftQuotesCount: number;
    draftQuotesTotal: number;
    draftQuotesPaid: number;
    draftQuotesRemaining: number;
    totalCommercialVolume: number; // Factures + Devis en cours
    count: number;
  };

  // 2. Encaissements réels (distincts du chiffre d'affaires)
  collections: {
    totalCollected: number;
    cash: number;
    check: number;
    transfer: number;
    cib: number;
    customerAdvancesReceived: number;
    salePaymentsCollected: number;
  };

  // 3. Créances clients arrêtées en fin de mois
  customerDebt: {
    totalOutstanding: number;
    confirmedDebt: number;
    draftQuotesRemaining: number;
    debtFromThisMonthSales: number;
    debtFromPriorSales: number;
    unallocatedAdvances: number;
    debtorsCount: number;
  };

  // 4. Achats & Fournisseurs du mois
  purchases: {
    totalInvoiced: number;
    paidAmount: number;
    remainingFromMonthPurchases: number;
    count: number;
    supplierPaymentsMade: number;
    supplierReturnsAmount: number;
    supplierReturnsCount: number;
    totalOutstandingDebtAtEnd: number;
    creditorsCount: number;
  };

  // 5. Charges d'exploitation & Produits exceptionnels
  expenses: {
    totalOperating: number;
    exceptionalIncome: number;
    categories: ExpenseCategoryBreakdown[];
    operatingCashPaid: number;
    operatingNonCashPaid: number;
  };

  // 6. Trésorerie par compte (soldes initiaux & finaux + virements)
  treasury: {
    accounts: TreasuryAccountMonthlySummary[];
    totalOpening: number;
    totalClosing: number;
    netVariation: number;
    totalTransfersVolume: number;
    closingTransfersTotal: number;
    manualTransfersTotal: number;
  };

  // 7. Sessions de caisse journalière
  cashSessions: {
    totalCount: number;
    closedCount: number;
    openCount: number;
    theoreticalTotal: number;
    closingCountedTotal: number;
    discrepancyTotal: number;
    closingTransfersTotal: number;
    manualTransfersTotal: number;
    totalTransfersVolume: number;
    transfersCount: number;
  };

  // 8. Stocks & Valorisation
  stock: {
    totalQuantity: number;
    valuationCost: number;
    valuationSelling: number;
    potentialMargin: number;
    warehouses: WarehouseStockSummary[];
    activeProductCount: number;
    zeroStockCount: number;
    valuationBasis: "LIVE" | "SNAPSHOT" | "UNAVAILABLE";
    valuationTimestamp: string;
    valuationNotice: string;
  };

  // 9. Anomalies & Rapprochements à clarifier
  review: {
    discrepancies: DiscrepancyReviewItem[];
    unresolvedCount: number;
  };
}

export interface MonthlyClosingSnapshotItem {
  id: number;
  reference: string;
  month: string;
  version: number;
  status: "DRAFT" | "FINAL" | "ARCHIVED";
  title: string | null;
  notes: string | null;
  generatedAt: string;
  generatedBy: string | null;
  periodStart: string;
  periodEnd: string;
  totals: MonthlyClosingTotals;
  checklist: MonthlyClosingChecklistItem[];
  discrepancies: DiscrepancyReviewItem[];
}

export type ClosingWorkflowStatus = "DRAFT" | "READY_FOR_APPROVAL" | "FINAL" | "REOPENED";

export interface ClosingBlocker {
  code: string;
  category: "checklist" | "discrepancies" | "cash_sessions" | "treasury" | "receivables" | "suppliers" | "stock" | "snapshot" | "backup";
  title: string;
  message: string;
  severity: "blocking" | "warning";
  actionHint?: string;
}

export interface MonthlyClosingPeriodInfo {
  id?: number;
  month: string;
  status: ClosingWorkflowStatus;
  isLocked: boolean;
  periodStart: string;
  periodEnd: string;
  finalSnapshotId?: number | null;
  finalSnapshotRef?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  backupConfirmedAt?: string | null;
  blockers: ClosingBlocker[];
  canMarkReady: boolean;
  canApprove: boolean;
  canReopen: boolean;
}

export interface MonthlyClosingAuditLogItem {
  id: number;
  periodId?: number | null;
  month: string;
  action: string;
  fromStatus?: string | null;
  toStatus: string;
  operator: string;
  reason?: string | null;
  snapshotRef?: string | null;
  version?: number | null;
  metadataJson?: string | null;
  createdAt: string;
}

export interface MonthlyClosingDashboardData {
  month: string; // "YYYY-MM"
  monthLabel: string; // e.g. "Octobre 2026"
  periodStartStr: string; // "01/10/2026 00:00:00"
  periodEndStr: string; // "31/10/2026 23:59:59"
  startDateUtc: string;
  endDateUtc: string;
  isCurrentMonth: boolean;
  shopSettings: {
    shopName: string;
    activity: string;
    address: string;
    phone: string;
    email: string;
    nifRc: string;
    nis: string;
    currency: string;
    documentFooter: string;
  };
  totals: MonthlyClosingTotals;
  checklist: MonthlyClosingChecklistItem[];
  snapshots: MonthlyClosingSnapshotItem[];
  availableMonths: string[];
  periodInfo: MonthlyClosingPeriodInfo;
  auditLogs: MonthlyClosingAuditLogItem[];
}

