/**
 * Historical Inventory Reconstruction Engine for Zakat Accounting
 * Reconstructs quantities and valuation as of historical cutoff date T.
 * Strictly uses StockMovement immutable ledger.
 *
 * Correction C Rules:
 * - Never clamps negative quantities to zero.
 * - Flags negative stock as a material anomaly (reconstructionStatus = "INCOMPLETE").
 * - Distinguishes legitimate zero cost price from missing/invalid/negative cost prices.
 * - Excludes unpriced and negative-stock items from confirmed asset valuation.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ZakatInventorySummary,
  ZakatProductInventoryItem,
  CostPriceStatus,
  InventoryItemStatus,
  SubsystemStatus,
} from "./types";
import {
  getAlgiersDayBoundariesUtc,
  isEffectiveOnOrBefore,
  roundMoney,
} from "./date-utils";

export interface ReconstructInventoryOptions {
  valuationDateStr: string;
  locationId?: number;
  productIds?: number[];
  db?: PrismaClient;
}

/**
 * Reconstructs historical inventory quantities and cost valuations as of valuationDateStr.
 */
export async function reconstructHistoricalInventory(
  options: ReconstructInventoryOptions
): Promise<ZakatInventorySummary> {
  const { valuationDateStr, locationId, productIds, db = defaultPrisma } = options;
  getAlgiersDayBoundariesUtc(valuationDateStr);

  // 1. Récupération de tous les produits (ou filtrés par productIds)
  const productWhere: Record<string, unknown> = {};
  if (productIds && productIds.length > 0) {
    productWhere.id = { in: productIds };
  }

  const products = await db.product.findMany({
    where: productWhere,
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      costPrice: true,
      sellingPrice: true,
      stock: true,
      unit: true,
      isActive: true,
      stocks: locationId
        ? { where: { locationId }, select: { locationId: true, quantity: true } }
        : { select: { locationId: true, quantity: true } },
    },
    orderBy: { name: "asc" },
  });

  // 2. Récupération des mouvements de stock
  const movementWhere: Record<string, unknown> = {};
  if (productIds && productIds.length > 0) {
    movementWhere.productId = { in: productIds };
  }
  if (locationId) {
    movementWhere.OR = [
      { fromLocationId: locationId },
      { toLocationId: locationId },
    ];
  }

  const allMovements = await db.stockMovement.findMany({
    where: movementWhere,
    select: {
      id: true,
      productId: true,
      type: true,
      fromLocationId: true,
      toLocationId: true,
      quantity: true,
      stockBefore: true,
      stockAfter: true,
      date: true,
      createdAt: true,
      reference: true,
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  // Grouper les mouvements par produit
  const movementsByProduct = new Map<number, typeof allMovements>();
  for (const m of allMovements) {
    if (!m.productId) continue;
    const list = movementsByProduct.get(m.productId) ?? [];
    list.push(m);
    movementsByProduct.set(m.productId, list);
  }

  const items: ZakatProductInventoryItem[] = [];
  const warnings: string[] = [];

  let confirmedValueDZD = 0;
  let unverifiedValueDZD = 0;
  let totalConfirmedQuantity = 0;
  let positiveStockQuantity = 0;
  let negativeStockQuantity = 0;
  let productsWithStockCount = 0;
  let missingCostPriceCount = 0;
  let negativeStockCount = 0;
  let unreconciledProductsCount = 0;

  for (const product of products) {
    const pMovements = movementsByProduct.get(product.id) ?? [];

    let forwardQty = 0;
    const movementsAfterCutoff: typeof allMovements = [];

    for (const m of pMovements) {
      const effectiveDate = m.date || m.createdAt;
      const isBeforeOrOn = isEffectiveOnOrBefore(effectiveDate, valuationDateStr);

      if (isBeforeOrOn) {
        const qtyChange = calculateQuantityChange(m, locationId);
        forwardQty += qtyChange;
      } else {
        movementsAfterCutoff.push(m);
      }
    }

    // Calcul de la quantité par reconstruction rétrograde (backward)
    const currentStock = locationId
      ? (product.stocks.find((s) => s.locationId === locationId)?.quantity ?? 0)
      : (product.stocks.reduce((sum, s) => sum + s.quantity, 0) || product.stock || 0);

    let backwardQty = currentStock;
    for (const m of movementsAfterCutoff) {
      const qtyChange = calculateQuantityChange(m, locationId);
      backwardQty -= qtyChange;
    }

    const hasMovements = pMovements.length > 0;
    let finalReconstructedQty = forwardQty;
    let isQuantityReconciled = true;

    if (hasMovements) {
      if (forwardQty !== backwardQty) {
        isQuantityReconciled = false;
        unreconciledProductsCount++;
        warnings.push(
          `Écart de réconciliation stock pour "${product.name}" (${product.sku}) : ` +
          `Forward = ${forwardQty}, Backward = ${backwardQty}. Quantité Forward retenue.`
        );
      }
    } else {
      if (currentStock !== 0) {
        isQuantityReconciled = false;
        finalReconstructedQty = currentStock;
        warnings.push(
          `Produit "${product.name}" (${product.sku}) possède un stock actuel (${currentStock}) mais aucun mouvement d'historique StockMovement enregistré.`
        );
      }
    }

    // Analyse du prix de revient (costPrice)
    const rawCost = product.costPrice;
    let costPriceStatus: CostPriceStatus = "VALID";
    let hasMissingCostPrice = false;

    if (rawCost === null || rawCost === undefined || isNaN(rawCost)) {
      costPriceStatus = "MISSING";
      hasMissingCostPrice = true;
    } else if (rawCost < 0) {
      costPriceStatus = "INVALID_NEGATIVE";
      hasMissingCostPrice = true;
    } else if (rawCost === 0) {
      costPriceStatus = "ZERO_LEGITIMATE";
    } else {
      costPriceStatus = "VALID";
    }

    // Détection de stock négatif (PRESERVER LA VALEUR RÉELLE SANS LA CLAMPER À ZÉRO)
    const hasNegativeStock = finalReconstructedQty < 0;
    let itemStatus: InventoryItemStatus = "CONFIRMED";
    let totalCostValue: number | null = null;
    let anomalyReason: string | undefined;

    if (hasNegativeStock) {
      negativeStockCount++;
      negativeStockQuantity += finalReconstructedQty;
      itemStatus = "NEGATIVE_STOCK_ANOMALY";
      totalCostValue = null; // Exclu de l'actif valorisé (pas d'actif négatif inventé)
      anomalyReason = `Stock historique négatif (${finalReconstructedQty} ${product.unit || "pièce"}). Anomalie physique ou de saisie de mouvements.`;
      warnings.push(
        `Anomalie critique : Stock historique négatif pour "${product.name}" (${product.sku}) au ${valuationDateStr} : ${finalReconstructedQty} ${product.unit}. Vérifier les mouvements.`
      );
    } else if (finalReconstructedQty === 0) {
      itemStatus = "ZERO_QUANTITY";
      totalCostValue = 0;
    } else {
      // Stock strictement positif (finalReconstructedQty > 0)
      positiveStockQuantity += finalReconstructedQty;
      productsWithStockCount++;

      if (hasMissingCostPrice) {
        missingCostPriceCount++;
        itemStatus = "UNPRICED_ANOMALY";
        totalCostValue = null; // EXCLU DES ACTIFS CONFIRMÉS
        anomalyReason = `Prix de revient ${costPriceStatus === "MISSING" ? "manquant" : "invalide négatif"}. Valorisation exclue des actifs confirmés.`;
        warnings.push(
          `Prix de revient ${costPriceStatus === "MISSING" ? "manquant" : "invalide négatif"} (${rawCost}) pour "${product.name}" (${product.sku}) en stock (${finalReconstructedQty} ${product.unit}). Valeur exclue du total confirmé.`
        );
      } else {
        itemStatus = "CONFIRMED";
        const val = roundMoney(finalReconstructedQty * (rawCost ?? 0));
        totalCostValue = val;
        confirmedValueDZD = roundMoney(confirmedValueDZD + val);
        totalConfirmedQuantity += finalReconstructedQty;

        if (costPriceStatus === "ZERO_LEGITIMATE") {
          warnings.push(
            `Produit "${product.name}" (${product.sku}) valorisé avec un prix de revient nul (0 DA). Vérifier s'il s'agit d'un don ou d'un coût non renseigné.`
          );
        }
      }
    }

    items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      costPrice: rawCost,
      sellingPrice: product.sellingPrice,
      reconstructedQuantity: finalReconstructedQty, // VÉRITABLE QUANTITÉ HISTORIQUE NON TRONQUÉE
      forwardQuantity: forwardQty,
      backwardQuantity: backwardQty,
      isQuantityReconciled,
      totalCostValue,
      unit: product.unit || "pièce",
      hasMissingCostPrice,
      hasNegativeStock,
      costPriceStatus,
      status: itemStatus,
      anomalyReason,
    });
  }

  // Détermination du statut du sous-système inventaire
  let reconstructionStatus: SubsystemStatus = "VERIFIED";
  if (negativeStockCount > 0) {
    // Une anomalie de stock négatif est bloquante et rend le calcul incomplet
    reconstructionStatus = "INCOMPLETE";
  } else if (missingCostPriceCount > 0 || unreconciledProductsCount > 0) {
    reconstructionStatus = "REQUIRES_REVIEW";
  } else {
    reconstructionStatus = "VERIFIED";
  }

  // Avertissement général sur la classification des produits
  warnings.push(
    "Classification des actifs : L'ERP ne possède pas de classification distinguant les marchandises commerciales pour la revente du matériel d'exploitation ou des consommables. Le gestionnaire doit vérifier et exclure les actifs non destinés au commerce."
  );

  return {
    reconstructionStatus,
    totalValueDZD: confirmedValueDZD,
    confirmedValueDZD,
    unverifiedValueDZD,
    totalQuantity: totalConfirmedQuantity,
    positiveStockQuantity,
    negativeStockQuantity,
    productsCount: products.length,
    productsWithStockCount,
    missingCostPriceCount,
    negativeStockCount,
    unreconciledProductsCount,
    items,
    warnings,
  };
}

/**
 * Calcule l'impact quantitatif net d'un mouvement de stock selon son type
 * et le périmètre d'emplacement sélectionné.
 */
function calculateQuantityChange(
  movement: {
    type: string;
    fromLocationId: number | null;
    toLocationId: number | null;
    quantity: number;
  },
  targetLocationId?: number
): number {
  const { type, fromLocationId, toLocationId, quantity } = movement;

  if (targetLocationId) {
    let delta = 0;
    if (toLocationId === targetLocationId) delta += quantity;
    if (fromLocationId === targetLocationId) delta -= quantity;
    return delta;
  }

  switch (type) {
    case "INITIAL":
    case "RECEIPT":
      return quantity;

    case "SALE":
    case "ISSUE":
      return -quantity;

    case "ADJUSTMENT": {
      if (toLocationId !== null && fromLocationId === null) return quantity;
      if (fromLocationId !== null && toLocationId === null) return -quantity;
      return 0;
    }

    case "TRANSFER":
      return 0;

    default:
      return 0;
  }
}
