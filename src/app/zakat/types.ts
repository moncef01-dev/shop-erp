import type {
  NisabStandard,
  ZakatYearType,
  CustomerFundsConfirmation,
  ZakatCalculationGlobalStatus,
  ZakatCalculationResult,
} from "@/lib/zakat";
import type { OperatorAttribution } from "./auth";

export type {
  NisabStandard,
  ZakatYearType,
  CustomerFundsConfirmation,
  ZakatCalculationGlobalStatus,
  ZakatCalculationResult,
  OperatorAttribution,
};

export type ZakatApprovalStatus =
  | "DRAFT"
  | "REQUIRES_REVIEW"
  | "INCOMPLETE"
  | "APPROVED"
  | "REJECTED";

export interface ZakatValuationDTO {
  id: number;
  reference: string;
  valuationDate: string; // YYYY-MM-DD
  hawlStartDate: string;
  hawlEndDate: string;
  nisabMethod: string;
  nisabValueDZD: number;
  nisabGoldPriceDZD?: number | null;
  nisabSilverPriceDZD?: number | null;
  zakatRate: number;
  zakatYearType: "LUNAR" | "SOLAR";
  inventoryValuationMethod: string;
  manualLiabilitiesDZD: number;
  manualLiabilitiesNote?: string | null;
  customerFundsConfirmation: CustomerFundsConfirmation;
  totalInventoryDZD: number;
  totalTreasuryDZD: number;
  totalReceivablesDZD: number;
  totalSupplierPrepaymentsDZD: number;
  unverifiedAssetsDZD: number;
  customerFundsHeldDZD: number;
  totalAssetsDZD: number;
  totalLiabilitiesDZD: number;
  totalAdjustmentsDZD: number;
  zakatableBaseDZD: number;
  zakatDueDZD: number;
  isNisabReached: boolean;
  calculationStatus: ZakatCalculationGlobalStatus;
  approvalStatus: ZakatApprovalStatus;
  statusReason?: string | null;
  notes?: string | null;
  metadataJson?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvalNotes?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  itemsCount?: number;
  adjustmentsCount?: number;
}

export interface ZakatValuationItemDTO {
  id: number;
  valuationId: number;
  category: "INVENTORY" | "TREASURY" | "RECEIVABLE" | "SUPPLIER_PREPAYMENT" | "CUSTOMER_FUNDS" | "LIABILITY";
  sourceType?: string | null;
  sourceId?: number | null;
  reference?: string | null;
  description: string;
  quantity?: number | null;
  unitValueDZD?: number | null;
  totalValueDZD: number;
  status: string;
  notes?: string | null;
  createdAt: string;
}

export interface ZakatAdjustmentDTO {
  id: number;
  valuationId: number;
  category: string;
  description: string;
  amountDZD: number;
  adjustmentType: "ADD" | "DEDUCT";
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface ZakatDashboardData {
  latestValuation: ZakatValuationDTO | null;
  allValuations: ZakatValuationDTO[];
  stats: {
    totalValuationsCount: number;
    approvedValuationsCount: number;
    draftValuationsCount: number;
    incompleteValuationsCount: number;
    lastValuationDate: string | null;
    lastZakatDueDZD: number | null;
  };
}

export interface ZakatValuationDetailData {
  valuation: ZakatValuationDTO;
  items: ZakatValuationItemDTO[];
  adjustments: ZakatAdjustmentDTO[];
  snapshot: ZakatCalculationResult | null;
}

export interface CalculateZakatPreviewInput {
  valuationDate: string; // YYYY-MM-DD
  hawlStartDate: string;
  hawlEndDate: string;
  nisabMethod: NisabStandard;
  goldGramPriceDZD?: number;
  silverGramPriceDZD?: number;
  manualNisabDZD?: number;
  zakatYearType: ZakatYearType;
  zakatRate?: number;
  manualLiabilitiesDZD: number;
  manualLiabilitiesNote?: string;
  customerFundsConfirmation: CustomerFundsConfirmation;
}

export interface SaveZakatValuationInput {
  valuationDate: string;
  hawlStartDate: string;
  hawlEndDate: string;
  nisabMethod: string;
  nisabValueDZD: number;
  nisabGoldPriceDZD?: number | null;
  nisabSilverPriceDZD?: number | null;
  zakatRate: number;
  zakatYearType: "LUNAR" | "SOLAR";
  inventoryValuationMethod?: string;
  manualLiabilitiesDZD: number;
  manualLiabilitiesNote?: string;
  customerFundsConfirmation: CustomerFundsConfirmation;
  notes?: string;
  calculationResult: ZakatCalculationResult;
  adjustments?: Array<{
    category: string;
    description: string;
    amountDZD: number;
    adjustmentType: "ADD" | "DEDUCT";
    reason: string;
    createdBy?: string;
  }>;
}

export interface AddZakatAdjustmentInput {
  valuationId: number;
  category: string;
  description: string;
  amountDZD: number;
  adjustmentType: "ADD" | "DEDUCT";
  reason: string;
  createdBy?: string;
}

export interface ApproveZakatValuationInput {
  valuationId: number;
  approverName: string;
  approvalNotes?: string;
  confirmDisclaimer: boolean;
}

