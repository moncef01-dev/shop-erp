/**
 * Historical Supplier Advances & Prepayments Reconstruction Engine
 * Reconstructs unallocated payments given to suppliers (avances/versements supplémentaires)
 * as of historical cutoff date T.
 *
 * Correction B Rules:
 * - If allocation table is missing or unverified, EXCLUDE the uncertain amount from confirmed assets.
 * - Confirmed unallocated amount must be 0 if allocation history is missing.
 * - Report the unverified amount separately.
 * - Do NOT silently suppress DB errors other than specific missing table check.
 * - Do NOT count reversed payments as active prepayments.
 * - Do NOT double-count between treasury and supplier prepayments.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ZakatSupplierPrepaymentsSummary,
  ZakatSupplierPrepaymentItem,
  SupplierPrepaymentReconstructionStatus,
  SubsystemStatus,
} from "./types";
import { isEffectiveOnOrBefore, roundMoney } from "./date-utils";

export interface ReconstructSupplierAdvancesOptions {
  valuationDateStr: string;
  includeInAssets?: boolean;
  db?: PrismaClient;
}

export async function reconstructHistoricalSupplierAdvances(
  options: ReconstructSupplierAdvancesOptions
): Promise<ZakatSupplierPrepaymentsSummary> {
  const { valuationDateStr, includeInAssets = true, db = defaultPrisma } = options;

  const suppliers = await db.supplier.findMany({
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  let allPayments: Array<{
    id: number;
    reference: string;
    supplierId: number;
    amount: number;
    isReversal: boolean;
    status: string;
    date: Date;
    createdAt: Date;
  }> = [];

  let allAllocations: Array<{
    id: number;
    reference: string;
    paymentId: number;
    supplierId: number;
    amount: number;
    isReversal: boolean;
    date: Date;
    createdAt: Date;
  }> = [];

  const warnings: string[] = [];
  let isAllocationHistoryAvailable = true;

  // 1. Récupération des versements supplémentaires
  try {
    allPayments = await db.supplierAdditionalPayment.findMany({
      select: {
        id: true,
        reference: true,
        supplierId: true,
        amount: true,
        isReversal: true,
        status: true,
        date: true,
        createdAt: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      warnings.push("Table supplier_additional_payments absente dans la base.");
      return {
        reconstructionStatus: "CONFIRMED",
        subsystemStatus: "VERIFIED",
        isAllocationHistoryAvailable: false,
        totalRecordedPrepaymentsDZD: 0,
        totalAllocationsTrackedDZD: 0,
        confirmedUnallocatedPrepaymentsDZD: 0,
        unverifiedPrepaymentsDZD: 0,
        totalUnallocatedPrepaymentsDZD: 0,
        suppliersCount: 0,
        isIncludedInAssets: includeInAssets,
        requiresManagerReview: false,
        reviewNotice: "Aucun versement supplémentaire fournisseur enregistré dans la base.",
        items: [],
        warnings,
      };
    }
    // Ne pas masquer les autres erreurs réelles
    throw err;
  }

  // 2. Récupération des imputations sur dettes d'achats
  try {
    allAllocations = await db.supplierAdditionalPaymentAllocation.findMany({
      where: {
        status: "completed",
      },
      select: {
        id: true,
        reference: true,
        paymentId: true,
        supplierId: true,
        amount: true,
        isReversal: true,
        date: true,
        createdAt: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      isAllocationHistoryAvailable = false;
      warnings.push(
        "Table d'imputation absente : La table supplier_additional_payment_allocations est indisponible dans la base. L'historique d'affectation des versements supplémentaires ne peut pas être vérifié."
      );
    } else {
      // Les erreurs autres que table absente doivent être propagées
      throw err;
    }
  }

  const items: ZakatSupplierPrepaymentItem[] = [];

  // Indexation par fournisseur
  const paymentsBySupplier = new Map<number, typeof allPayments>();
  for (const p of allPayments) {
    const list = paymentsBySupplier.get(p.supplierId) ?? [];
    list.push(p);
    paymentsBySupplier.set(p.supplierId, list);
  }

  const allocationsBySupplier = new Map<number, typeof allAllocations>();
  for (const a of allAllocations) {
    const list = allocationsBySupplier.get(a.supplierId) ?? [];
    list.push(a);
    allocationsBySupplier.set(a.supplierId, list);
  }

  let totalGrossGiven = 0;
  let totalGrossReversed = 0;
  let totalAllocationsTracked = 0;
  let totalConfirmedUnallocated = 0;
  let totalUnverifiedAmount = 0;

  for (const supplier of suppliers) {
    const sPayments = paymentsBySupplier.get(supplier.id) ?? [];
    const sAllocations = allocationsBySupplier.get(supplier.id) ?? [];

    if (sPayments.length === 0) continue;

    let sGiven = 0;
    let sReversed = 0;

    for (const p of sPayments) {
      const pDate = p.date || p.createdAt;
      if (!isEffectiveOnOrBefore(pDate, valuationDateStr)) continue;

      if (!p.isReversal) {
        sGiven += p.amount;
      } else if (p.status === "completed") {
        sReversed += p.amount;
      }
    }

    let sAllocated = 0;
    if (isAllocationHistoryAvailable) {
      for (const a of sAllocations) {
        const aDate = a.date || a.createdAt;
        if (!isEffectiveOnOrBefore(aDate, valuationDateStr)) continue;

        if (!a.isReversal) {
          sAllocated += a.amount;
        } else {
          sAllocated -= a.amount;
        }
      }
    }

    totalGrossGiven += sGiven;
    totalGrossReversed += sReversed;
    totalAllocationsTracked += sAllocated;

    const netGiven = Math.max(0, sGiven - sReversed);

    if (isAllocationHistoryAvailable) {
      const unallocated = roundMoney(Math.max(0, netGiven - sAllocated));
      if (unallocated > 0) {
        totalConfirmedUnallocated = roundMoney(totalConfirmedUnallocated + unallocated);
        items.push({
          supplierId: supplier.id,
          code: supplier.code,
          name: supplier.name,
          totalGiven: roundMoney(sGiven),
          totalReversed: roundMoney(sReversed),
          totalAllocated: roundMoney(sAllocated),
          unallocatedPrepayment: unallocated,
        });
      }
    } else {
      // TABLE D'IMPUTATION ABSENTE :
      // On ne peut PAS supposer qu'aucune imputation n'a eu lieu !
      // On ne peut PAS qualifier ce montant d'actif confirmé !
      if (netGiven > 0) {
        totalUnverifiedAmount = roundMoney(totalUnverifiedAmount + netGiven);
        items.push({
          supplierId: supplier.id,
          code: supplier.code,
          name: supplier.name,
          totalGiven: roundMoney(sGiven),
          totalReversed: roundMoney(sReversed),
          totalAllocated: 0,
          unallocatedPrepayment: 0, // 0 DA confirmé
        });
      }
    }
  }

  let reconstructionStatus: SupplierPrepaymentReconstructionStatus;
  let subsystemStatus: SubsystemStatus;

  if (!isAllocationHistoryAvailable) {
    reconstructionStatus = "UNVERIFIED_MISSING_ALLOCATIONS";
    subsystemStatus = totalUnverifiedAmount > 0 ? "INCOMPLETE" : "VERIFIED";
    if (totalUnverifiedAmount > 0) {
      warnings.push(
        `Avances fournisseurs non vérifiées : Un montant de ${totalUnverifiedAmount.toLocaleString("fr-DZ")} DA de versements fournisseurs est enregistré, mais l'absence de table d'imputation empêche de vérifier si ces fonds ont été consommés. Ce montant est EXCLU des actifs zakatables confirmés.`
      );
    }
  } else {
    reconstructionStatus = "CONFIRMED";
    subsystemStatus = totalConfirmedUnallocated > 0 ? "REQUIRES_REVIEW" : "VERIFIED";
  }

  items.sort((a, b) => b.totalGiven - a.totalGiven);

  const reviewNotice = isAllocationHistoryAvailable
    ? "Acomptes fournisseurs vérifiés : Les versements supplémentaires non imputés représentent une créance de l'entreprise sur ses fournisseurs. Le gestionnaire doit s'assurer que ces acomptes sont recouvrables."
    : "Historique d'imputation indisponible : Les versements fournisseurs ne peuvent pas être validés comme créances certaines sans l'historique d'affectation sur factures.";

  return {
    reconstructionStatus,
    subsystemStatus,
    isAllocationHistoryAvailable,
    totalRecordedPrepaymentsDZD: roundMoney(totalGrossGiven - totalGrossReversed),
    totalAllocationsTrackedDZD: roundMoney(totalAllocationsTracked),
    confirmedUnallocatedPrepaymentsDZD: roundMoney(totalConfirmedUnallocated),
    unverifiedPrepaymentsDZD: roundMoney(totalUnverifiedAmount),
    totalUnallocatedPrepaymentsDZD: roundMoney(totalConfirmedUnallocated), // SEUL LE MONTANT CONFIRMÉ EST RETENU
    suppliersCount: items.length,
    isIncludedInAssets: includeInAssets,
    requiresManagerReview: !isAllocationHistoryAvailable || totalConfirmedUnallocated > 0,
    reviewNotice,
    items,
    warnings,
  };
}
