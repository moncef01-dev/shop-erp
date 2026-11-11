/**
 * Types & Interfaces for Business Zakat Accounting (زكاة عروض التجارة)
 * Phase 2: Read-Only Historical Calculation Engine
 * Includes Financial Integrity, Reconciliation & Typed Statuses.
 */

export type ZakatYearType = "LUNAR" | "SOLAR";

export type NisabStandard = "SILVER" | "GOLD" | "MANUAL";

export type ZakatCalculationGlobalStatus = "COMPLETE" | "REQUIRES_REVIEW" | "INCOMPLETE";

export type SubsystemStatus = "VERIFIED" | "REQUIRES_REVIEW" | "INCOMPLETE";

export type CustomerFundsConfirmation = "CONFIRMED_INCLUDED" | "CONFIRMED_EXCLUDED" | "UNCONFIRMED";

export type CostPriceStatus = "VALID" | "ZERO_LEGITIMATE" | "MISSING" | "INVALID_NEGATIVE";

export type InventoryItemStatus = "CONFIRMED" | "NEGATIVE_STOCK_ANOMALY" | "UNPRICED_ANOMALY" | "ZERO_QUANTITY";

export interface NisabConfig {
  standard: NisabStandard;
  /**
   * Price in DZD per gram of silver (for 595g standard). Required if standard === "SILVER".
   */
  silverGramPriceDZD?: number;
  /**
   * Price in DZD per gram of gold (for 85g standard). Required if standard === "GOLD".
   */
  goldGramPriceDZD?: number;
  /**
   * Explicit threshold in DZD. Required if standard === "MANUAL".
   */
  manualThresholdDZD?: number;
}

export interface ZakatCalculationInput {
  /**
   * Historical valuation date (cutoff date T). Format: "YYYY-MM-DD" or Date object.
   */
  valuationDate: string | Date;
  /**
   * Start date of the Hawl period. Format: "YYYY-MM-DD" or Date object.
   */
  periodStartDate: string | Date;
  /**
   * End date of the Hawl period. Format: "YYYY-MM-DD" or Date object.
   */
  periodEndDate: string | Date;
  /**
   * Zakat calendar type: "LUNAR" (Hijri, default 2.5%) or "SOLAR" (Gregorian, e.g. 2.577%).
   */
  zakatYearType: ZakatYearType;
  /**
   * Configurable Zakat rate (e.g. 0.025 for 2.5% or 0.02577 for 2.577%).
   * For LUNAR, defaults to 0.025 if omitted.
   * For SOLAR, must be explicitly provided.
   */
  zakatRate?: number;
  /**
   * Nisab configuration (Gold 85g, Silver 595g, or Manual amount).
   */
  nisabConfig: NisabConfig;
  /**
   * Manually entered deductible liabilities in DZD (entered by manager).
   * Must be >= 0.
   */
  manualLiabilitiesDZD: number;
  /**
   * Optional manual liabilities description / note by the manager.
   */
  manualLiabilitiesNote?: string;
  /**
   * Manager's confirmation on whether customer trust funds (advances & savings held in treasury)
   * are already accounted for in manualLiabilitiesDZD.
   * Defaults to "UNCONFIRMED" if omitted.
   */
  customerFundsConfirmation?: CustomerFundsConfirmation;
  /**
   * Optional calculation filters or options.
   */
  options?: {
    locationId?: number;
    includeSupplierPrepayments?: boolean;
    productIds?: number[];
  };
}

// ─── INVENTORY BREAKDOWN TYPES ────────────────────────────────────────────────

export interface ZakatProductInventoryItem {
  productId: number;
  sku: string;
  name: string;
  category: string | null;
  costPrice: number | null;
  sellingPrice: number | null;
  reconstructedQuantity: number; // Actual quantity (can be negative if historical movement anomaly exists)
  forwardQuantity: number;
  backwardQuantity: number;
  isQuantityReconciled: boolean;
  totalCostValue: number | null; // null if negative stock or unpriced anomaly
  unit: string;
  hasMissingCostPrice: boolean;
  hasNegativeStock: boolean;
  costPriceStatus: CostPriceStatus;
  status: InventoryItemStatus;
  anomalyReason?: string;
  notes?: string;
}

export interface ZakatInventorySummary {
  reconstructionStatus: SubsystemStatus;
  totalValueDZD: number; // Confirmed valuation
  confirmedValueDZD: number;
  unverifiedValueDZD: number;
  totalQuantity: number;
  positiveStockQuantity: number;
  negativeStockQuantity: number;
  productsCount: number;
  productsWithStockCount: number;
  missingCostPriceCount: number;
  negativeStockCount: number;
  unreconciledProductsCount: number;
  items: ZakatProductInventoryItem[];
  warnings: string[];
}

// ─── TREASURY BREAKDOWN TYPES ─────────────────────────────────────────────────

export interface ZakatTreasuryAccountItem {
  accountId: number;
  code: string;
  name: string;
  type: "cash" | "safe" | "bank" | "other";
  isDefault: boolean;
  openingBalance: number;
  inflows: number;
  outflows: number;
  transfersIn: number;
  transfersOut: number;
  reconstructedBalance: number;
  hasNegativeBalance: boolean;
}

export interface ZakatTreasurySummary {
  reconstructionStatus: SubsystemStatus;
  totalBalanceDZD: number;
  activeAccountsCount: number;
  interAccountTransfersNet: number;
  isTransfersNetZero: boolean;
  accounts: ZakatTreasuryAccountItem[];
  warnings: string[];
}

// ─── CUSTOMER RECEIVABLES BREAKDOWN TYPES ─────────────────────────────────────

export interface ZakatCustomerReceivableItem {
  customerId: number;
  code: string | null;
  name: string;
  phone: string | null;
  totalBilledDeliveries: number;
  totalPaymentsReceived: number;
  totalAdvancesAllocated: number;
  totalSavingsUsed: number;
  outstandingBalance: number;
  salesCount: number;
  lastSaleDate: string | null;
}

export interface ZakatCustomerReceivablesSummary {
  reconstructionStatus: SubsystemStatus;
  totalReceivablesDZD: number;
  customersWithDebtCount: number;
  totalCustomersEvaluated: number;
  requiresManagerReview: boolean;
  reviewNotice: string;
  customers: ZakatCustomerReceivableItem[];
  warnings: string[];
}

// ─── CUSTOMER FUNDS HELD (TRUST FUNDS) ────────────────────────────────────────

export interface ZakatCustomerFundsSummary {
  reconstructionStatus: SubsystemStatus;
  totalSavingsHeldDZD: number;
  totalUnallocatedAdvancesDZD: number;
  totalCustomerFundsDZD: number;
  savingsAccountsCount: number;
  unallocatedAdvancesCount: number;
  note: string;
  warnings: string[];
}

// ─── SUPPLIER PREPAYMENTS BREAKDOWN TYPES ─────────────────────────────────────

export type SupplierPrepaymentReconstructionStatus =
  | "CONFIRMED"
  | "UNVERIFIED_MISSING_ALLOCATIONS"
  | "FAILED";

export interface ZakatSupplierPrepaymentItem {
  supplierId: number;
  code: string | null;
  name: string;
  totalGiven: number;
  totalReversed: number;
  totalAllocated: number;
  unallocatedPrepayment: number;
}

export interface ZakatSupplierPrepaymentsSummary {
  reconstructionStatus: SupplierPrepaymentReconstructionStatus;
  subsystemStatus: SubsystemStatus;
  isAllocationHistoryAvailable: boolean;
  totalRecordedPrepaymentsDZD: number;
  totalAllocationsTrackedDZD: number;
  confirmedUnallocatedPrepaymentsDZD: number;
  unverifiedPrepaymentsDZD: number;
  totalUnallocatedPrepaymentsDZD: number; // Confirmed amount
  suppliersCount: number;
  isIncludedInAssets: boolean;
  requiresManagerReview: boolean;
  reviewNotice: string;
  items: ZakatSupplierPrepaymentItem[];
  warnings: string[];
}

// ─── OVERALL CALCULATION RESULT ───────────────────────────────────────────────

export interface ZakatPeriodSummary {
  periodStartDate: string;
  periodEndDate: string;
  valuationDate: string;
  cutoffLocalTime: string;
  calendarType: ZakatYearType;
  zakatRate: number;
  zakatRatePercent: number;
}

export interface ZakatNisabSummary {
  standard: NisabStandard;
  standardGrams?: number;
  gramPriceDZD?: number;
  thresholdDZD: number;
  isNisabReached: boolean;
  ruleExplanation: string;
}

export interface CustomerFundsReconciliationInfo {
  status: CustomerFundsConfirmation;
  totalTreasuryBalanceDZD: number;
  customerAdvancesHeldDZD: number;
  customerSavingsHeldDZD: number;
  totalCustomerFundsHeldDZD: number;
  isReviewRequired: boolean;
  warningNotice: string;
}

export interface ZakatLiabilitiesSummary {
  manualLiabilitiesDZD: number;
  source: "MANAGER_ENTERED";
  verifiedBySystem: false;
  managerNote?: string;
  customerFundsReconciliation: CustomerFundsReconciliationInfo;
  explanation: string;
}

export interface ZakatCalculationSummary {
  globalStatus: ZakatCalculationGlobalStatus;
  statusReason: string;
  confirmedZakatableAssetsDZD: number;
  unverifiedAssetsDZD: number;
  totalZakatableAssetsDZD: number; // Confirmed assets only
  manualLiabilitiesDZD: number;
  customerFundsHeldDZD: number;
  customerFundsReconciliationStatus: CustomerFundsConfirmation;
  preliminaryZakatBaseDZD: number;
  isNisabReached: boolean;
  zakatRate: number;
  preliminaryZakatDueDZD: number;
  isProvisionalAndIncomplete: boolean;
  isFinalReligiousRuling: false;
  disclaimer: string;
}

export interface ZakatReconciliationSummary {
  globalStatus: ZakatCalculationGlobalStatus;
  subsystemStatuses: {
    inventory: SubsystemStatus;
    treasury: SubsystemStatus;
    receivables: SubsystemStatus;
    customerFunds: SubsystemStatus;
    supplierPrepayments: SubsystemStatus;
    liabilitiesReconciliation: SubsystemStatus;
  };
  isFullyReconciled: boolean;
  inventoryPassed: boolean;
  treasuryTransfersNetZero: boolean;
  receivablesReviewPending: boolean;
  supplierPrepaymentsVerified: boolean;
  customerFundsReconciled: boolean;
  allWarnings: string[];
}

export interface ZakatCalculationResult {
  status: ZakatCalculationGlobalStatus;
  calculatedAt: string;
  period: ZakatPeriodSummary;
  nisab: ZakatNisabSummary;
  assets: {
    inventory: ZakatInventorySummary;
    treasury: ZakatTreasurySummary;
    receivables: ZakatCustomerReceivablesSummary;
    supplierPrepayments: ZakatSupplierPrepaymentsSummary;
    confirmedAssetsDZD: number;
    unverifiedAssetsDZD: number;
    totalAssetsDZD: number; // Confirmed assets
  };
  customerFundsHeld: ZakatCustomerFundsSummary;
  liabilities: ZakatLiabilitiesSummary;
  calculation: ZakatCalculationSummary;
  reconciliation: ZakatReconciliationSummary;
}
