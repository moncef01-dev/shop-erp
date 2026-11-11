/**
 * Reconciliation and Integrity Audit Engine for Zakat Accounting
 * Performs mathematical cross-checks across all historical domains
 * and derives the typed global calculation status (COMPLETE | REQUIRES_REVIEW | INCOMPLETE).
 */

import type {
  ZakatInventorySummary,
  ZakatTreasurySummary,
  ZakatCustomerReceivablesSummary,
  ZakatCustomerFundsSummary,
  ZakatSupplierPrepaymentsSummary,
  ZakatReconciliationSummary,
  ZakatCalculationGlobalStatus,
  SubsystemStatus,
  CustomerFundsConfirmation,
} from "./types";

export interface ReconciliationInput {
  inventory: ZakatInventorySummary;
  treasury: ZakatTreasurySummary;
  receivables: ZakatCustomerReceivablesSummary;
  customerFunds: ZakatCustomerFundsSummary;
  supplierPrepayments: ZakatSupplierPrepaymentsSummary;
  customerFundsConfirmation: CustomerFundsConfirmation;
  manualLiabilitiesDZD: number;
}

export function performZakatReconciliation(input: ReconciliationInput): ZakatReconciliationSummary {
  const {
    inventory,
    treasury,
    receivables,
    customerFunds,
    supplierPrepayments,
    customerFundsConfirmation,
  } = input;

  const allWarnings: string[] = [];

  // 1. Audit inventaire
  const inventoryPassed =
    inventory.unreconciledProductsCount === 0 &&
    inventory.negativeStockCount === 0 &&
    inventory.missingCostPriceCount === 0;

  if (inventory.unreconciledProductsCount > 0) {
    allWarnings.push(
      `Réconciliation stock incomplète : ${inventory.unreconciledProductsCount} produit(s) présentent un écart entre la méthode Forward et la méthode Backward.`
    );
  }
  if (inventory.missingCostPriceCount > 0) {
    allWarnings.push(
      `Prix de revient manquants ou invalides : ${inventory.missingCostPriceCount} produit(s) en stock ont un coût manquant ou négatif. Leurs valeurs sont exclues du total confirmé.`
    );
  }
  if (inventory.negativeStockCount > 0) {
    allWarnings.push(
      `Stocks négatifs détectés : ${inventory.negativeStockCount} produit(s) présentent une quantité négative à la date d'évaluation. L'inventaire est entaché d'une anomalie physique bloquante.`
    );
  }
  allWarnings.push(...inventory.warnings);

  // 2. Audit trésorerie
  const treasuryTransfersNetZero = treasury.isTransfersNetZero;
  if (!treasuryTransfersNetZero) {
    allWarnings.push(
      `Anomalie critique de trésorerie : Les virements inter-comptes ne s'annulent pas (Écart net : ${treasury.interAccountTransfersNet} DA). Risque de double comptage ou de création monétaire artificielle.`
    );
  }
  allWarnings.push(...treasury.warnings);

  // 3. Audit créances clients
  const receivablesReviewPending = receivables.requiresManagerReview;
  allWarnings.push(...receivables.warnings);

  // 4. Audit avances fournisseurs
  const supplierPrepaymentsVerified =
    supplierPrepayments.isAllocationHistoryAvailable &&
    supplierPrepayments.reconstructionStatus === "CONFIRMED";

  if (!supplierPrepayments.isAllocationHistoryAvailable) {
    allWarnings.push(
      `Historique d'imputation fournisseur manquant : La table d'imputation est absente de la base. Les avances de ${supplierPrepayments.unverifiedPrepaymentsDZD.toLocaleString("fr-DZ")} DA sont non vérifiées et exclues des actifs confirmés.`
    );
  }
  allWarnings.push(...supplierPrepayments.warnings);

  // 5. Audit réconciliation fonds clients dans le passif
  const customerFundsReconciled =
    customerFunds.totalCustomerFundsDZD === 0 ||
    customerFundsConfirmation !== "UNCONFIRMED";

  let liabilitiesReconciliationStatus: SubsystemStatus = "VERIFIED";
  if (!customerFundsReconciled) {
    liabilitiesReconciliationStatus = "REQUIRES_REVIEW";
    allWarnings.push(
      `Réconciliation des fonds clients requise : ${customerFunds.totalCustomerFundsDZD.toLocaleString("fr-DZ")} DA de fonds clients sont logés dans la trésorerie. Le gestionnaire n'a pas confirmé s'ils sont déjà déduits dans les dettes manuelles. Une confirmation explicite est requise.`
    );
  }
  allWarnings.push(...customerFunds.warnings);

  // Sous-statuts détaillés
  const subsystemStatuses = {
    inventory: inventory.reconstructionStatus,
    treasury: treasury.reconstructionStatus,
    receivables: receivables.reconstructionStatus,
    customerFunds: customerFunds.reconstructionStatus,
    supplierPrepayments: supplierPrepayments.subsystemStatus,
    liabilitiesReconciliation: liabilitiesReconciliationStatus,
  };

  // Dérivation stricte du statut global (INCOMPLETE > REQUIRES_REVIEW > COMPLETE)
  let globalStatus: ZakatCalculationGlobalStatus = "COMPLETE";

  if (
    subsystemStatuses.inventory === "INCOMPLETE" ||
    subsystemStatuses.treasury === "INCOMPLETE" ||
    subsystemStatuses.supplierPrepayments === "INCOMPLETE"
  ) {
    globalStatus = "INCOMPLETE";
  } else if (
    subsystemStatuses.inventory === "REQUIRES_REVIEW" ||
    subsystemStatuses.treasury === "REQUIRES_REVIEW" ||
    subsystemStatuses.receivables === "REQUIRES_REVIEW" ||
    subsystemStatuses.customerFunds === "REQUIRES_REVIEW" ||
    subsystemStatuses.supplierPrepayments === "REQUIRES_REVIEW" ||
    subsystemStatuses.liabilitiesReconciliation === "REQUIRES_REVIEW"
  ) {
    globalStatus = "REQUIRES_REVIEW";
  } else {
    globalStatus = "COMPLETE";
  }

  const isFullyReconciled =
    globalStatus === "COMPLETE" &&
    inventoryPassed &&
    treasuryTransfersNetZero &&
    supplierPrepaymentsVerified &&
    customerFundsReconciled;

  const uniqueWarnings = Array.from(new Set(allWarnings));

  return {
    globalStatus,
    subsystemStatuses,
    isFullyReconciled,
    inventoryPassed,
    treasuryTransfersNetZero,
    receivablesReviewPending,
    supplierPrepaymentsVerified,
    customerFundsReconciled,
    allWarnings: uniqueWarnings,
  };
}
