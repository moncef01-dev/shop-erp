/**
 * Central Business Zakat Historical Calculation Engine
 * Phase 2: Read-Only Historical Calculation Engine
 *
 * Coordinates data extraction, historical reconstructions,
 * financial math, Nisab thresholds, and reconciliation audits.
 * Strictly respects Corrections A, B, C, D, and E.
 */

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type {
  ZakatCalculationInput,
  ZakatCalculationResult,
  ZakatPeriodSummary,
  ZakatNisabSummary,
  ZakatLiabilitiesSummary,
  ZakatCalculationSummary,
  CustomerFundsReconciliationInfo,
} from "./types";
import { validateZakatCalculationInput } from "./validation";
import { reconstructHistoricalInventory } from "./inventory-history";
import { reconstructHistoricalTreasury } from "./treasury-history";
import { reconstructHistoricalReceivables } from "./receivables-history";
import { reconstructHistoricalCustomerFunds } from "./customer-funds-history";
import { reconstructHistoricalSupplierAdvances } from "./supplier-advances-history";
import { performZakatReconciliation } from "./reconciliation";
import { roundMoney } from "./date-utils";

export interface CalculateZakatOptions {
  db?: PrismaClient;
}

/**
 * Executes a strictly read-only historical Zakat calculation for a business Hawl.
 * Does NOT write any record to the database.
 */
export async function calculateHistoricalBusinessZakat(
  input: ZakatCalculationInput,
  options?: CalculateZakatOptions
): Promise<ZakatCalculationResult> {
  const db = options?.db ?? defaultPrisma;

  // 1. Validation rigoureuse des entrées
  const params = validateZakatCalculationInput(input);

  // 2. Exécutions des reconstructions historiques en parallèle
  const [
    inventorySummary,
    treasurySummary,
    receivablesSummary,
    customerFundsSummary,
    supplierAdvancesSummary,
  ] = await Promise.all([
    reconstructHistoricalInventory({
      valuationDateStr: params.valuationDateStr,
      locationId: params.options?.locationId,
      productIds: params.options?.productIds,
      db,
    }),
    reconstructHistoricalTreasury({
      valuationDateStr: params.valuationDateStr,
      db,
    }),
    reconstructHistoricalReceivables({
      valuationDateStr: params.valuationDateStr,
      db,
    }),
    reconstructHistoricalCustomerFunds({
      valuationDateStr: params.valuationDateStr,
      db,
    }),
    reconstructHistoricalSupplierAdvances({
      valuationDateStr: params.valuationDateStr,
      includeInAssets: params.options?.includeSupplierPrepayments ?? true,
      db,
    }),
  ]);

  // 3. Agrégation des actifs zakatables (Correction B & C: SEULS LES ACTIFS VÉRIFIÉS SONT RETENUS)
  const confirmedInventoryTotal = inventorySummary.confirmedValueDZD;
  const unverifiedInventoryTotal = inventorySummary.unverifiedValueDZD;

  const treasuryTotal = treasurySummary.totalBalanceDZD;
  const receivablesTotal = receivablesSummary.totalReceivablesDZD;

  const confirmedSupplierPrepaymentsTotal = supplierAdvancesSummary.isIncludedInAssets
    ? supplierAdvancesSummary.confirmedUnallocatedPrepaymentsDZD
    : 0;
  const unverifiedSupplierPrepaymentsTotal = supplierAdvancesSummary.unverifiedPrepaymentsDZD;

  // Total des actifs confirmés
  const totalConfirmedZakatableAssetsDZD = roundMoney(
    confirmedInventoryTotal + treasuryTotal + receivablesTotal + confirmedSupplierPrepaymentsTotal
  );

  // Total des montants incertains ou exclus de l'assiette confirmée
  const totalUnverifiedAssetsDZD = roundMoney(
    unverifiedInventoryTotal + unverifiedSupplierPrepaymentsTotal
  );

  // 4. Passif déductible (exclusivement saisi par le gestionnaire)
  const manualLiabilitiesDZD = params.manualLiabilitiesDZD;

  // 5. Calcul de l'assiette nette zakatable (Wi'ā' al-Zakāt)
  const preliminaryZakatBaseDZD = Math.max(
    0,
    roundMoney(totalConfirmedZakatableAssetsDZD - manualLiabilitiesDZD)
  );

  // 6. Test d'atteinte du Nisab
  const isNisabReached = preliminaryZakatBaseDZD >= params.nisabThresholdDZD;

  // 7. Calcul du montant de Zakat dû
  const preliminaryZakatDueDZD = isNisabReached
    ? roundMoney(preliminaryZakatBaseDZD * params.zakatRate)
    : 0;

  // 8. Audit de réconciliation et dérivation du statut global (Correction D)
  const reconciliation = performZakatReconciliation({
    inventory: inventorySummary,
    treasury: treasurySummary,
    receivables: receivablesSummary,
    customerFunds: customerFundsSummary,
    supplierPrepayments: supplierAdvancesSummary,
    customerFundsConfirmation: params.customerFundsConfirmation,
    manualLiabilitiesDZD,
  });

  const globalStatus = reconciliation.globalStatus;
  const isProvisionalAndIncomplete = globalStatus === "INCOMPLETE";

  // 9. Réconciliation des fonds clients et des dettes manuelles (Correction A)
  const customerFundsConfirmation = params.customerFundsConfirmation;
  const totalCustomerFundsHeldDZD = customerFundsSummary.totalCustomerFundsDZD;
  let customerFundsNotice = "";
  const isCustomerFundsReviewRequired =
    customerFundsConfirmation === "UNCONFIRMED" && totalCustomerFundsHeldDZD > 0;

  if (customerFundsConfirmation === "UNCONFIRMED") {
    if (totalCustomerFundsHeldDZD > 0) {
      customerFundsNotice = `Attention : Les comptes de trésorerie (${treasuryTotal.toLocaleString("fr-DZ")} DA) incluent physiquement les fonds clients (${totalCustomerFundsHeldDZD.toLocaleString("fr-DZ")} DA : ${customerFundsSummary.totalUnallocatedAdvancesDZD.toLocaleString("fr-DZ")} DA d'acomptes + ${customerFundsSummary.totalSavingsHeldDZD.toLocaleString("fr-DZ")} DA d'épargne). Vous n'avez pas confirmé si ces fonds sont déjà inclus dans vos dettes déductibles manuelles (${manualLiabilitiesDZD.toLocaleString("fr-DZ")} DA). Une confirmation explicite est requise pour éviter une surévaluation de vos actifs ou une double déduction.`;
    } else {
      customerFundsNotice = "Aucun fonds client sous gestion détecté à la date d'évaluation.";
    }
  } else if (customerFundsConfirmation === "CONFIRMED_INCLUDED") {
    customerFundsNotice = `Le gestionnaire confirme que les fonds clients (${totalCustomerFundsHeldDZD.toLocaleString("fr-DZ")} DA) sont déjà inclus dans le montant des dettes manuelles déclarées (${manualLiabilitiesDZD.toLocaleString("fr-DZ")} DA). Aucun ajustement automatique n'a été appliqué.`;
  } else {
    customerFundsNotice = `Le gestionnaire confirme que les fonds clients (${totalCustomerFundsHeldDZD.toLocaleString("fr-DZ")} DA) sont exclus des dettes déductibles. Les fonds clients demeurent comptabilisés dans la trésorerie brute.`;
  }

  const customerFundsReconciliation: CustomerFundsReconciliationInfo = {
    status: customerFundsConfirmation,
    totalTreasuryBalanceDZD: treasuryTotal,
    customerAdvancesHeldDZD: customerFundsSummary.totalUnallocatedAdvancesDZD,
    customerSavingsHeldDZD: customerFundsSummary.totalSavingsHeldDZD,
    totalCustomerFundsHeldDZD,
    isReviewRequired: isCustomerFundsReviewRequired,
    warningNotice: customerFundsNotice,
  };

  // 10. Disclaimer et libellé d'état selon statut global (Correction D)
  let statusReason = "";
  let disclaimer = "";

  if (globalStatus === "INCOMPLETE") {
    statusReason =
      "Calcul incomplet : Des anomalies matérielles ou des données sources historiques requises sont indisponibles (ex: table d'imputation fournisseur absente, stock historique négatif). Le résultat affiché est strictement provisoire.";
    disclaimer =
      "AVERTISSEMENT : CALCUL INCOMPLET ET PROVISOIRE. Ce résultat ne peut en aucun cas être utilisé comme une obligation religieuse définitive en raison de données historiques non vérifiées.";
  } else if (globalStatus === "REQUIRES_REVIEW") {
    statusReason =
      "Calcul en attente de revue : Les données historiques sont cohérentes, mais nécessitent des confirmations manuelles du gestionnaire (solvabilité des créances, confirmation de la prise en compte des fonds clients dans les dettes, classification des actifs).";
    disclaimer =
      "CALCUL EN ATTENTE DE VALIDATION MANUELLE. Le gestionnaire de l'entreprise doit examiner les créances douteuses, la classification des marchandises et la confirmation des fonds clients avant approbation finale.";
  } else {
    statusReason =
      "Calcul complet : Toutes les données historiques ont été réconciliées avec succès et l'ensemble des confirmations de gestion ont été fournies.";
    disclaimer =
      "Calcul préliminaire réconcilié basé sur les écritures comptables du logiciel. Le gestionnaire demeure responsable de l'approbation méthodologique selon son référentiel de conformité.";
  }

  const period: ZakatPeriodSummary = {
    periodStartDate: params.periodStartDateStr,
    periodEndDate: params.periodEndDateStr,
    valuationDate: params.valuationDateStr,
    cutoffLocalTime: `${params.valuationDateStr} 23:59:59 (Africa/Algiers, UTC+1)`,
    calendarType: params.zakatYearType,
    zakatRate: params.zakatRate,
    zakatRatePercent: params.zakatRatePercent,
  };

  const nisab: ZakatNisabSummary = {
    standard: input.nisabConfig.standard,
    standardGrams: params.nisabGrams,
    gramPriceDZD: params.nisabGramPriceDZD,
    thresholdDZD: params.nisabThresholdDZD,
    isNisabReached,
    ruleExplanation: params.nisabRuleExplanation,
  };

  const liabilities: ZakatLiabilitiesSummary = {
    manualLiabilitiesDZD,
    source: "MANAGER_ENTERED",
    verifiedBySystem: false,
    managerNote: params.manualLiabilitiesNote,
    customerFundsReconciliation,
    explanation:
      "Passif déductible saisi manuellement par le gestionnaire. L'ERP n'applique aucune déduction automatique conformément aux règles de validation comptable et religieuse.",
  };

  const calculation: ZakatCalculationSummary = {
    globalStatus,
    statusReason,
    confirmedZakatableAssetsDZD: totalConfirmedZakatableAssetsDZD,
    unverifiedAssetsDZD: totalUnverifiedAssetsDZD,
    totalZakatableAssetsDZD: totalConfirmedZakatableAssetsDZD,
    manualLiabilitiesDZD,
    customerFundsHeldDZD: totalCustomerFundsHeldDZD,
    customerFundsReconciliationStatus: customerFundsConfirmation,
    preliminaryZakatBaseDZD,
    isNisabReached,
    zakatRate: params.zakatRate,
    preliminaryZakatDueDZD,
    isProvisionalAndIncomplete,
    isFinalReligiousRuling: false,
    disclaimer,
  };

  return {
    status: globalStatus,
    calculatedAt: new Date().toISOString(),
    period,
    nisab,
    assets: {
      inventory: inventorySummary,
      treasury: treasurySummary,
      receivables: receivablesSummary,
      supplierPrepayments: supplierAdvancesSummary,
      confirmedAssetsDZD: totalConfirmedZakatableAssetsDZD,
      unverifiedAssetsDZD: totalUnverifiedAssetsDZD,
      totalAssetsDZD: totalConfirmedZakatableAssetsDZD,
    },
    customerFundsHeld: customerFundsSummary,
    liabilities,
    calculation,
    reconciliation,
  };
}
