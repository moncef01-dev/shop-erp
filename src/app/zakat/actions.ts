"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  calculateHistoricalBusinessZakat,
  roundMoney,
  type NisabConfig,
  type ZakatCalculationResult,
} from "@/lib/zakat";
import type {
  ZakatDashboardData,
  ZakatValuationDTO,
  ZakatValuationDetailData,
  ZakatValuationItemDTO,
  ZakatAdjustmentDTO,
  CalculateZakatPreviewInput,
  SaveZakatValuationInput,
  AddZakatAdjustmentInput,
  ApproveZakatValuationInput,
  CustomerFundsConfirmation,
  ZakatCalculationGlobalStatus,
  ZakatApprovalStatus,
} from "./types";
import { formatDeclarativeOperator } from "./auth";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Graceful fallback when executed outside Next.js request context (e.g. CLI tests)
  }
}

type ValuationRecord = {
  id: number;
  reference: string;
  valuationDate: Date | string;
  hawlStartDate: Date | string;
  hawlEndDate: Date | string;
  nisabMethod: string;
  nisabValueDZD: number;
  nisabGoldPriceDZD?: number | null;
  nisabSilverPriceDZD?: number | null;
  zakatRate: number;
  zakatYearType: string;
  inventoryValuationMethod: string;
  manualLiabilitiesDZD: number;
  manualLiabilitiesNote?: string | null;
  customerFundsConfirmation: string;
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
  calculationStatus: string;
  approvalStatus: string;
  statusReason?: string | null;
  notes?: string | null;
  metadataJson?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  approvalNotes?: string | null;
  rejectedAt?: Date | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: { items?: number; adjustments?: number };
  items?: unknown[];
  adjustments?: unknown[];
};

/**
 * Format a valuation DB record to DTO
 */
function mapValuationToDTO(v: ValuationRecord): ZakatValuationDTO {
  return {
    id: v.id,
    reference: v.reference,
    valuationDate: v.valuationDate instanceof Date ? v.valuationDate.toISOString().slice(0, 10) : String(v.valuationDate).slice(0, 10),
    hawlStartDate: v.hawlStartDate instanceof Date ? v.hawlStartDate.toISOString().slice(0, 10) : String(v.hawlStartDate).slice(0, 10),
    hawlEndDate: v.hawlEndDate instanceof Date ? v.hawlEndDate.toISOString().slice(0, 10) : String(v.hawlEndDate).slice(0, 10),
    nisabMethod: v.nisabMethod,
    nisabValueDZD: v.nisabValueDZD,
    nisabGoldPriceDZD: v.nisabGoldPriceDZD,
    nisabSilverPriceDZD: v.nisabSilverPriceDZD,
    zakatRate: v.zakatRate,
    zakatYearType: v.zakatYearType as "LUNAR" | "SOLAR",
    inventoryValuationMethod: v.inventoryValuationMethod,
    manualLiabilitiesDZD: v.manualLiabilitiesDZD,
    manualLiabilitiesNote: v.manualLiabilitiesNote,
    customerFundsConfirmation: v.customerFundsConfirmation as CustomerFundsConfirmation,
    totalInventoryDZD: v.totalInventoryDZD,
    totalTreasuryDZD: v.totalTreasuryDZD,
    totalReceivablesDZD: v.totalReceivablesDZD,
    totalSupplierPrepaymentsDZD: v.totalSupplierPrepaymentsDZD,
    unverifiedAssetsDZD: v.unverifiedAssetsDZD,
    customerFundsHeldDZD: v.customerFundsHeldDZD,
    totalAssetsDZD: v.totalAssetsDZD,
    totalLiabilitiesDZD: v.totalLiabilitiesDZD,
    totalAdjustmentsDZD: v.totalAdjustmentsDZD,
    zakatableBaseDZD: v.zakatableBaseDZD,
    zakatDueDZD: v.zakatDueDZD,
    isNisabReached: v.isNisabReached,
    calculationStatus: v.calculationStatus as ZakatCalculationGlobalStatus,
    approvalStatus: v.approvalStatus as ZakatApprovalStatus,
    statusReason: v.statusReason,
    notes: v.notes,
    metadataJson: v.metadataJson,
    approvedAt: v.approvedAt ? v.approvedAt.toISOString() : null,
    approvedBy: v.approvedBy,
    approvalNotes: v.approvalNotes,
    rejectedAt: v.rejectedAt ? v.rejectedAt.toISOString() : null,
    rejectedBy: v.rejectedBy,
    rejectionReason: v.rejectionReason,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
    itemsCount: (v as { _count?: { items: number } })._count?.items ?? (v as { items?: unknown[] }).items?.length ?? 0,
    adjustmentsCount: (v as { _count?: { adjustments: number } })._count?.adjustments ?? (v as { adjustments?: unknown[] }).adjustments?.length ?? 0,
  };
}

/**
 * Generates an atomic sequential reference: ZAK-YYYYMM-XXXX
 */
async function generateZakatReference(db: PrismaClient | typeof prisma, dateStr: string): Promise<string> {
  const ym = dateStr.replace(/-/g, "").slice(0, 6); // e.g. "202611"
  const prefix = `ZAK-${ym}-`;

  const lastValuation = await db.zakatValuation.findFirst({
    where: {
      reference: { startsWith: prefix },
    },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastValuation?.reference) {
    const parts = lastValuation.reference.split("-");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

/**
 * 1. Main Dashboard Data Action
 */
export async function getZakatDashboardDataAction(
  options?: { db?: PrismaClient }
): Promise<ZakatDashboardData> {
  const db = options?.db ?? prisma;

  try {
    const valuations = await db.zakatValuation.findMany({
      orderBy: { valuationDate: "desc" },
      include: {
        _count: {
          select: { items: true, adjustments: true },
        },
      },
    });

    const dtos = valuations.map(mapValuationToDTO);
    const latestValuation = dtos.length > 0 ? dtos[0] : null;

    const approvedCount = dtos.filter((v) => v.approvalStatus === "APPROVED").length;
    const draftCount = dtos.filter((v) => v.approvalStatus === "DRAFT").length;
    const incompleteCount = dtos.filter((v) => v.approvalStatus === "INCOMPLETE").length;

    const latestApproved = dtos.find((v) => v.approvalStatus === "APPROVED");

    return {
      latestValuation,
      allValuations: dtos,
      stats: {
        totalValuationsCount: dtos.length,
        approvedValuationsCount: approvedCount,
        draftValuationsCount: draftCount,
        incompleteValuationsCount: incompleteCount,
        lastValuationDate: latestValuation?.valuationDate || null,
        lastZakatDueDZD: latestApproved ? latestApproved.zakatDueDZD : latestValuation?.zakatDueDZD || null,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      return {
        latestValuation: null,
        allValuations: [],
        stats: {
          totalValuationsCount: 0,
          approvedValuationsCount: 0,
          draftValuationsCount: 0,
          incompleteValuationsCount: 0,
          lastValuationDate: null,
          lastZakatDueDZD: null,
        },
      };
    }
    throw err;
  }
}

/**
 * 2. Calculate Zakat Preview Action (Calls Phase 2 Historical Engine)
 */
export async function calculateZakatPreviewAction(
  input: CalculateZakatPreviewInput
): Promise<ZakatCalculationResult> {
  let nisabConfig: NisabConfig;

  if (input.nisabMethod === "GOLD") {
    if (!input.goldGramPriceDZD || input.goldGramPriceDZD <= 0) {
      throw new Error("Le cours du gramme d'or en DZD est obligatoire pour le Nisab Or.");
    }
    nisabConfig = {
      standard: "GOLD",
      goldGramPriceDZD: input.goldGramPriceDZD,
    };
  } else if (input.nisabMethod === "SILVER") {
    if (!input.silverGramPriceDZD || input.silverGramPriceDZD <= 0) {
      throw new Error("Le cours du gramme d'argent en DZD est obligatoire pour le Nisab Argent.");
    }
    nisabConfig = {
      standard: "SILVER",
      silverGramPriceDZD: input.silverGramPriceDZD,
    };
  } else {
    if (!input.manualNisabDZD || input.manualNisabDZD <= 0) {
      throw new Error("Le montant du seuil de Nisab personnalisé doit être strictement positif.");
    }
    nisabConfig = {
      standard: "MANUAL",
      manualThresholdDZD: input.manualNisabDZD,
    };
  }

  const result = await calculateHistoricalBusinessZakat({
    valuationDate: input.valuationDate,
    periodStartDate: input.hawlStartDate,
    periodEndDate: input.hawlEndDate,
    zakatYearType: input.zakatYearType,
    zakatRate: input.zakatRate,
    nisabConfig,
    manualLiabilitiesDZD: input.manualLiabilitiesDZD || 0,
    manualLiabilitiesNote: input.manualLiabilitiesNote,
    customerFundsConfirmation: input.customerFundsConfirmation || "UNCONFIRMED",
  });

  return result;
}

/**
 * 3. Save Zakat Valuation Action (Persistent Snapshot)
 */
export async function saveZakatValuationAction(
  input: SaveZakatValuationInput,
  options?: { db?: PrismaClient }
): Promise<{ success: boolean; valuationId: number; reference: string }> {
  const db = options?.db ?? prisma;

  const {
    valuationDate,
    hawlStartDate,
    hawlEndDate,
    nisabMethod,
    nisabValueDZD,
    nisabGoldPriceDZD,
    nisabSilverPriceDZD,
    zakatRate,
    zakatYearType,
    inventoryValuationMethod = "COST",
    manualLiabilitiesDZD = 0,
    manualLiabilitiesNote,
    customerFundsConfirmation,
    notes,
    calculationResult,
    adjustments = [],
  } = input;

  if (!valuationDate || !hawlStartDate || !hawlEndDate) {
    throw new Error("Les dates de valorisation et de Hawl sont obligatoires.");
  }

  // Calcul du montant net des ajustements
  let totalAdjustments = 0;
  for (const adj of adjustments) {
    if (adj.adjustmentType === "ADD") {
      totalAdjustments = roundMoney(totalAdjustments + adj.amountDZD);
    } else {
      totalAdjustments = roundMoney(totalAdjustments - adj.amountDZD);
    }
  }

  // Actifs confirmés issus du moteur Phase 2
  const confirmedInventory = calculationResult.assets.inventory.confirmedValueDZD;
  const totalTreasury = calculationResult.assets.treasury.totalBalanceDZD;
  const totalReceivables = calculationResult.assets.receivables.totalReceivablesDZD;
  const confirmedPrepayments = calculationResult.assets.supplierPrepayments.confirmedUnallocatedPrepaymentsDZD;
  const unverifiedAssets = calculationResult.assets.unverifiedAssetsDZD;
  const customerFundsHeld = calculationResult.customerFundsHeld.totalCustomerFundsDZD;

  const totalConfirmedAssets = roundMoney(
    confirmedInventory + totalTreasury + totalReceivables + confirmedPrepayments
  );

  // Assiette finale = Actifs confirmés + Ajustements - Dettes manuelles
  const adjustedAssets = Math.max(0, roundMoney(totalConfirmedAssets + totalAdjustments));
  const zakatableBase = Math.max(0, roundMoney(adjustedAssets - manualLiabilitiesDZD));

  const isNisabReached = zakatableBase >= nisabValueDZD;
  const zakatDue = isNisabReached ? roundMoney(zakatableBase * zakatRate) : 0;

  // Détermination du statut d'approbation initial
  let initialApprovalStatus = "DRAFT";
  if (calculationResult.status === "INCOMPLETE") {
    initialApprovalStatus = "INCOMPLETE";
  } else if (calculationResult.status === "REQUIRES_REVIEW") {
    initialApprovalStatus = "REQUIRES_REVIEW";
  } else {
    initialApprovalStatus = "DRAFT";
  }

  // Sérialisation du snapshot complet
  const metadataJson = JSON.stringify(calculationResult);

  // Exécution atomique
  return await db.$transaction(async (tx) => {
    const reference = await generateZakatReference(tx as unknown as PrismaClient, valuationDate);

    // 1. Création de la valorisation
    const valuation = await tx.zakatValuation.create({
      data: {
        reference,
        valuationDate: new Date(valuationDate),
        hawlStartDate: new Date(hawlStartDate),
        hawlEndDate: new Date(hawlEndDate),
        nisabMethod,
        nisabValueDZD,
        nisabGoldPriceDZD: nisabGoldPriceDZD || null,
        nisabSilverPriceDZD: nisabSilverPriceDZD || null,
        zakatRate,
        zakatYearType,
        inventoryValuationMethod,
        manualLiabilitiesDZD,
        manualLiabilitiesNote: manualLiabilitiesNote || null,
        customerFundsConfirmation,
        totalInventoryDZD: confirmedInventory,
        totalTreasuryDZD: totalTreasury,
        totalReceivablesDZD: totalReceivables,
        totalSupplierPrepaymentsDZD: confirmedPrepayments,
        unverifiedAssetsDZD: unverifiedAssets,
        customerFundsHeldDZD: customerFundsHeld,
        totalAssetsDZD: totalConfirmedAssets,
        totalLiabilitiesDZD: manualLiabilitiesDZD,
        totalAdjustmentsDZD: totalAdjustments,
        zakatableBaseDZD: zakatableBase,
        zakatDueDZD: zakatDue,
        isNisabReached,
        calculationStatus: calculationResult.status,
        approvalStatus: initialApprovalStatus,
        statusReason: calculationResult.calculation.statusReason,
        notes: notes || null,
        metadataJson,
      },
    });

    // 2. Génération des lignes de détail (Valuation Items)
    const itemsToCreate: Prisma.ZakatValuationItemCreateManyInput[] = [];

    // A. Inventaire
    for (const item of calculationResult.assets.inventory.items) {
      if (item.reconstructedQuantity !== 0 || item.hasMissingCostPrice) {
        itemsToCreate.push({
          valuationId: valuation.id,
          category: "INVENTORY",
          sourceType: "Product",
          sourceId: item.productId,
          reference: item.sku,
          description: item.name,
          quantity: item.reconstructedQuantity,
          unitValueDZD: item.costPrice,
          totalValueDZD: item.totalCostValue ?? 0,
          status: item.status,
          notes: item.anomalyReason || null,
        });
      }
    }

    // B. Trésorerie
    for (const acc of calculationResult.assets.treasury.accounts) {
      itemsToCreate.push({
        valuationId: valuation.id,
        category: "TREASURY",
        sourceType: "TreasuryAccount",
        sourceId: acc.accountId,
        reference: acc.code,
        description: acc.name,
        quantity: 1,
        unitValueDZD: acc.reconstructedBalance,
        totalValueDZD: acc.reconstructedBalance,
        status: acc.hasNegativeBalance ? "NEGATIVE_BALANCE" : "VERIFIED",
        notes: `Entrées: ${acc.inflows} DA, Sorties: ${acc.outflows} DA, Virements nets: ${acc.transfersIn - acc.transfersOut} DA`,
      });
    }

    // C. Créances clients
    for (const cust of calculationResult.assets.receivables.customers) {
      itemsToCreate.push({
        valuationId: valuation.id,
        category: "RECEIVABLE",
        sourceType: "Customer",
        sourceId: cust.customerId,
        reference: cust.code,
        description: cust.name,
        quantity: cust.salesCount,
        unitValueDZD: cust.outstandingBalance,
        totalValueDZD: cust.outstandingBalance,
        status: "PENDING_REVIEW",
        notes: `Facturé: ${cust.totalBilledDeliveries} DA, Réglé: ${cust.totalPaymentsReceived} DA`,
      });
    }

    // D. Avances fournisseurs
    for (const sup of calculationResult.assets.supplierPrepayments.items) {
      itemsToCreate.push({
        valuationId: valuation.id,
        category: "SUPPLIER_PREPAYMENT",
        sourceType: "Supplier",
        sourceId: sup.supplierId,
        reference: sup.code,
        description: sup.name,
        quantity: 1,
        unitValueDZD: sup.unallocatedPrepayment,
        totalValueDZD: sup.unallocatedPrepayment,
        status: calculationResult.assets.supplierPrepayments.isAllocationHistoryAvailable ? "CONFIRMED" : "UNVERIFIED",
        notes: `Versé: ${sup.totalGiven} DA, Imputé: ${sup.totalAllocated} DA`,
      });
    }

    // E. Fonds clients
    if (customerFundsHeld > 0) {
      itemsToCreate.push({
        valuationId: valuation.id,
        category: "CUSTOMER_FUNDS",
        sourceType: "CustomerSavings",
        sourceId: null,
        reference: "AMANAT",
        description: "Fonds clients logés en trésorerie (Amanat)",
        quantity: 1,
        unitValueDZD: customerFundsHeld,
        totalValueDZD: customerFundsHeld,
        status: customerFundsConfirmation,
        notes: calculationResult.liabilities.customerFundsReconciliation.warningNotice,
      });
    }

    if (itemsToCreate.length > 0) {
      await tx.zakatValuationItem.createMany({
        data: itemsToCreate,
      });
    }

    // 3. Création des ajustements du gérant
    if (adjustments.length > 0) {
      await tx.zakatAdjustment.createMany({
        data: adjustments.map((adj) => ({
          valuationId: valuation.id,
          category: adj.category,
          description: adj.description,
          amountDZD: adj.amountDZD,
          adjustmentType: adj.adjustmentType,
          reason: adj.reason,
          createdBy: adj.createdBy || "Gérant",
        })),
      });
    }

    return {
      success: true,
      valuationId: valuation.id,
      reference: valuation.reference,
    };
  });
}

/**
 * 4. Get Valuation Details Action (Strict Historical Snapshot - NO Recalculation)
 */
export async function getZakatValuationByIdAction(
  id: number,
  options?: { db?: PrismaClient }
): Promise<ZakatValuationDetailData | null> {
  const db = options?.db ?? prisma;

  const valuation = await db.zakatValuation.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: [{ category: "asc" }, { totalValueDZD: "desc" }],
      },
      adjustments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!valuation) return null;

  let snapshot: ZakatCalculationResult | null = null;
  if (valuation.metadataJson) {
    try {
      snapshot = JSON.parse(valuation.metadataJson);
    } catch {
      snapshot = null;
    }
  }

  const itemsDTO: ZakatValuationItemDTO[] = valuation.items.map((i) => ({
    id: i.id,
    valuationId: i.valuationId,
    category: i.category as ZakatValuationItemDTO["category"],
    sourceType: i.sourceType,
    sourceId: i.sourceId,
    reference: i.reference,
    description: i.description,
    quantity: i.quantity,
    unitValueDZD: i.unitValueDZD,
    totalValueDZD: i.totalValueDZD,
    status: i.status,
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
  }));

  const adjustmentsDTO: ZakatAdjustmentDTO[] = valuation.adjustments.map((a) => ({
    id: a.id,
    valuationId: a.valuationId,
    category: a.category,
    description: a.description,
    amountDZD: a.amountDZD,
    adjustmentType: a.adjustmentType as "ADD" | "DEDUCT",
    reason: a.reason,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    valuation: mapValuationToDTO(valuation),
    items: itemsDTO,
    adjustments: adjustmentsDTO,
    snapshot,
  };
}

/**
 * 5. Add Zakat Adjustment Action
 */
export async function addZakatAdjustmentAction(
  input: AddZakatAdjustmentInput,
  options?: { db?: PrismaClient }
): Promise<{ success: boolean; adjustmentId: number }> {
  const db = options?.db ?? prisma;

  const valuation = await db.zakatValuation.findUnique({
    where: { id: input.valuationId },
    include: { adjustments: true },
  });

  if (!valuation) {
    throw new Error("Évaluation introuvable.");
  }

  if (valuation.approvalStatus === "APPROVED") {
    throw new Error("Impossible d'ajouter un ajustement à une évaluation déjà approuvée et verrouillée.");
  }

  if (valuation.approvalStatus === "REJECTED") {
    throw new Error("Impossible d'ajouter un ajustement à une évaluation rejetée ou archivée.");
  }

  if (valuation.approvalStatus !== "DRAFT" && valuation.approvalStatus !== "REQUIRES_REVIEW") {
    throw new Error("Les ajustements ne peuvent être modifiés que sur une évaluation au statut Brouillon.");
  }

  if (!input.description || input.amountDZD <= 0 || !input.reason) {
    throw new Error("La description, le motif et un montant strictement positif sont requis.");
  }

  const recordedCreatedBy = formatDeclarativeOperator(input.createdBy);

  return await db.$transaction(async (tx) => {
    const adjustment = await tx.zakatAdjustment.create({
      data: {
        valuationId: input.valuationId,
        category: input.category,
        description: input.description,
        amountDZD: roundMoney(input.amountDZD),
        adjustmentType: input.adjustmentType,
        reason: input.reason,
        createdBy: recordedCreatedBy,
      },
    });

    // Recalculer les totaux de l'évaluation
    const allAdjustments = await tx.zakatAdjustment.findMany({
      where: { valuationId: input.valuationId },
    });

    let newTotalAdjustments = 0;
    for (const a of allAdjustments) {
      if (a.adjustmentType === "ADD") {
        newTotalAdjustments = roundMoney(newTotalAdjustments + a.amountDZD);
      } else {
        newTotalAdjustments = roundMoney(newTotalAdjustments - a.amountDZD);
      }
    }

    const adjustedAssets = Math.max(0, roundMoney(valuation.totalAssetsDZD + newTotalAdjustments));
    const newBase = Math.max(0, roundMoney(adjustedAssets - valuation.manualLiabilitiesDZD));
    const isNisabReached = newBase >= valuation.nisabValueDZD;
    const newZakatDue = isNisabReached ? roundMoney(newBase * valuation.zakatRate) : 0;

    await tx.zakatValuation.update({
      where: { id: input.valuationId },
      data: {
        totalAdjustmentsDZD: newTotalAdjustments,
        zakatableBaseDZD: newBase,
        zakatDueDZD: newZakatDue,
        isNisabReached,
      },
    });

    return { success: true, adjustmentId: adjustment.id };
  });
}

/**
 * 6. Remove Zakat Adjustment Action
 */
export async function removeZakatAdjustmentAction(
  adjustmentId: number,
  options?: { db?: PrismaClient }
): Promise<{ success: boolean }> {
  const db = options?.db ?? prisma;

  const adjustment = await db.zakatAdjustment.findUnique({
    where: { id: adjustmentId },
    include: { valuation: true },
  });

  if (!adjustment) {
    throw new Error("Ajustement introuvable.");
  }

  if (adjustment.valuation.approvalStatus === "APPROVED") {
    throw new Error("Impossible de supprimer un ajustement d'une évaluation déjà approuvée.");
  }

  if (adjustment.valuation.approvalStatus === "REJECTED") {
    throw new Error("Impossible de supprimer un ajustement d'une évaluation rejetée ou archivée.");
  }

  if (adjustment.valuation.approvalStatus !== "DRAFT" && adjustment.valuation.approvalStatus !== "REQUIRES_REVIEW") {
    throw new Error("Les ajustements ne peuvent être modifiés que sur une évaluation au statut Brouillon.");
  }

  const valuationId = adjustment.valuationId;

  await db.$transaction(async (tx) => {
    await tx.zakatAdjustment.delete({
      where: { id: adjustmentId },
    });

    const remainingAdjustments = await tx.zakatAdjustment.findMany({
      where: { valuationId },
    });

    let newTotalAdjustments = 0;
    for (const a of remainingAdjustments) {
      if (a.adjustmentType === "ADD") {
        newTotalAdjustments = roundMoney(newTotalAdjustments + a.amountDZD);
      } else {
        newTotalAdjustments = roundMoney(newTotalAdjustments - a.amountDZD);
      }
    }

    const adjustedAssets = Math.max(0, roundMoney(adjustment.valuation.totalAssetsDZD + newTotalAdjustments));
    const newBase = Math.max(0, roundMoney(adjustedAssets - adjustment.valuation.manualLiabilitiesDZD));
    const isNisabReached = newBase >= adjustment.valuation.nisabValueDZD;
    const newZakatDue = isNisabReached ? roundMoney(newBase * adjustment.valuation.zakatRate) : 0;

    await tx.zakatValuation.update({
      where: { id: valuationId },
      data: {
        totalAdjustmentsDZD: newTotalAdjustments,
        zakatableBaseDZD: newBase,
        zakatDueDZD: newZakatDue,
        isNisabReached,
      },
    });
  });

  return { success: true };
}

/**
 * 7. Approve Zakat Valuation Action (Immutable Lock)
 * 
 * SÉCURITÉ & ATTRIBUTION HONNÊTE :
 * L'ERP fonctionnant sans système d'authentification utilisateur / mot de passe,
 * l'identité approbatrice est déclarative et explicitement enregistrée comme non vérifiée.
 * L'horodatage est impérativement généré côté serveur.
 */
export async function approveZakatValuationAction(
  input: ApproveZakatValuationInput,
  options?: { db?: PrismaClient }
): Promise<{ success: boolean; approvedAt: string; reference: string; approvedBy: string }> {
  const db = options?.db ?? prisma;

  const valuation = await db.zakatValuation.findUnique({
    where: { id: input.valuationId },
  });

  if (!valuation) {
    throw new Error("Évaluation introuvable.");
  }

  // 1. Règle d'immutabilité et rejet strict des requêtes d'approbation dupliquées
  if (valuation.approvalStatus === "APPROVED") {
    throw new Error(
      "Cette évaluation est déjà approuvée et verrouillée de manière immuable. Les requêtes d'approbation dupliquées sont strictement rejetées."
    );
  }

  // 2. Règle d'intégrité : rejet d'approbation d'une évaluation déjà rejetée
  if (valuation.approvalStatus === "REJECTED") {
    throw new Error("Impossible d'approuver une évaluation rejetée. Une nouvelle évaluation doit être initiée.");
  }

  // 3. Règle d'incomplétude bloquante
  if (valuation.calculationStatus === "INCOMPLETE") {
    throw new Error(
      "Approbation refusée : Cette évaluation est INCOMPLÈTE en raison d'anomalies bloquantes ou de tables d'historique manquantes. Une évaluation incomplète ne peut pas être approuvée."
    );
  }

  // 4. Règle de revue obligatoire
  if (valuation.customerFundsConfirmation === "UNCONFIRMED" && valuation.customerFundsHeldDZD > 0) {
    throw new Error(
      "Approbation refusée : Vous devez obligatoirement confirmer la réconciliation des fonds clients (Amānāt) détenus en trésorerie avant d'approuver l'évaluation."
    );
  }

  // 5. Règle d'engagement légal et religieux
  if (!input.confirmDisclaimer) {
    throw new Error(
      "Vous devez expressément confirmer avoir pris connaissance de la mention légale et de conformité religieuse avant d'approuver."
    );
  }

  if (!input.approverName || !input.approverName.trim()) {
    throw new Error("Le nom de l'opérateur approbateur est obligatoire (saisie manuelle déclarative).");
  }

  // Attribution déclarative honnête (l'ERP n'ayant pas d'authentification utilisateur)
  const recordedApprover = formatDeclarativeOperator(input.approverName);
  // Horodatage strict généré côté serveur
  const now = new Date();

  await db.zakatValuation.update({
    where: { id: input.valuationId },
    data: {
      approvalStatus: "APPROVED",
      approvedAt: now,
      approvedBy: recordedApprover,
      approvalNotes: input.approvalNotes?.trim() || null,
    },
  });

  safeRevalidatePath("/zakat");
  safeRevalidatePath(`/zakat/${input.valuationId}`);

  return {
    success: true,
    approvedAt: now.toISOString(),
    approvedBy: recordedApprover,
    reference: valuation.reference,
  };
}

/**
 * 8. Reject Zakat Valuation Action
 */
export async function rejectZakatValuationAction(
  input: { valuationId: number; rejectionReason: string; operatorName?: string },
  options?: { db?: PrismaClient }
): Promise<{ success: boolean; rejectedBy: string }> {
  const db = options?.db ?? prisma;

  const valuation = await db.zakatValuation.findUnique({
    where: { id: input.valuationId },
  });

  if (!valuation) {
    throw new Error("Évaluation introuvable.");
  }

  if (valuation.approvalStatus === "APPROVED") {
    throw new Error("Impossible de rejeter une évaluation déjà approuvée et verrouillée.");
  }

  if (valuation.approvalStatus === "REJECTED") {
    throw new Error("Cette évaluation est déjà rejetée.");
  }

  if (!input.rejectionReason || !input.rejectionReason.trim()) {
    throw new Error("Le motif de rejet est obligatoire.");
  }

  const recordedRejector = formatDeclarativeOperator(input.operatorName);
  const now = new Date();

  await db.zakatValuation.update({
    where: { id: input.valuationId },
    data: {
      approvalStatus: "REJECTED",
      rejectedAt: now,
      rejectedBy: recordedRejector,
      rejectionReason: input.rejectionReason.trim(),
    },
  });

  safeRevalidatePath("/zakat");
  safeRevalidatePath(`/zakat/${input.valuationId}`);

  return { success: true, rejectedBy: recordedRejector };
}

/**
 * 9. Delete Draft Valuation Action
 * Explicitement sécurisé : Seuls les brouillons peuvent être supprimés.
 * Les évaluations approuvées ou rejetées sont protégées contre toute suppression.
 */
export async function deleteZakatDraftAction(
  valuationId: number,
  options?: { db?: PrismaClient }
): Promise<{ success: boolean }> {
  const db = options?.db ?? prisma;

  const valuation = await db.zakatValuation.findUnique({
    where: { id: valuationId },
  });

  if (!valuation) {
    throw new Error("Évaluation introuvable.");
  }

  if (valuation.approvalStatus === "APPROVED") {
    throw new Error("Règle de sécurité comptable : Une évaluation approuvée est immuable et ne peut pas être supprimée.");
  }

  if (valuation.approvalStatus === "REJECTED") {
    throw new Error("Règle d'audit financier : Une évaluation rejetée conserve son motif de rejet et son historique pour l'audit et ne peut pas être supprimée.");
  }

  if (valuation.approvalStatus !== "DRAFT" && valuation.approvalStatus !== "REQUIRES_REVIEW") {
    throw new Error(`Seules les évaluations au statut Brouillon (DRAFT) peuvent être supprimées (statut actuel : ${valuation.approvalStatus}).`);
  }

  // Suppression transactionnelle explicite des lignes filles et de l'évaluation brouillon
  await (db as PrismaClient).$transaction(async (tx) => {
    await tx.zakatAdjustment.deleteMany({
      where: { valuationId },
    });
    await tx.zakatValuationItem.deleteMany({
      where: { valuationId },
    });
    await tx.zakatValuation.delete({
      where: { id: valuationId },
    });
  });

  safeRevalidatePath("/zakat");

  return { success: true };
}

