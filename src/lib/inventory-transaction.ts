import { prisma } from "@/lib/prisma";

export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Déduit le stock d'un produit à un emplacement donné de manière atomique
 * à l'intérieur d'une transaction Prisma existante.
 * 
 * - Valide l'état actif du produit et de l'emplacement.
 * - Contrôle la disponibilité du stock physique (interdiction de stock négatif).
 * - Décrémente la ligne ProductStock correspondante.
 * - Recalcule le stock total du produit (somme de tous les dépôts).
 * - Enregistre le mouvement comptable StockMovement immuable lié à la vente.
 */
export async function deductStockForSaleItem(
  tx: PrismaTransactionClient,
  params: {
    saleId: number;
    saleReference: string;
    productId: number;
    locationId: number;
    quantity: number;
    customerName?: string | null;
    productCache?: Map<number, { id: number; name: string; sku: string; costPrice: number | null; isActive: boolean }>;
    locationCache?: Map<number, { id: number; name: string; code: string; isActive: boolean }>;
  }
) {
  const { saleId, saleReference, productId, locationId, quantity, customerName, productCache, locationCache } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`La quantité vendue doit être un entier strictement positif (reçu: ${quantity}).`);
  }

  // 1 & 2 & 3. Vérification produit, emplacement et stock disponible (en parallèle ou via cache)
  const cachedProduct = productCache?.get(productId);
  const cachedLocation = locationCache?.get(locationId);

  const [product, location, productStock] = await Promise.all([
    cachedProduct
      ? Promise.resolve(cachedProduct)
      : tx.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, sku: true, costPrice: true, isActive: true },
        }),
    cachedLocation
      ? Promise.resolve(cachedLocation)
      : tx.location.findUnique({
          where: { id: locationId },
          select: { id: true, name: true, code: true, isActive: true },
        }),
    tx.productStock.findUnique({
      where: { productId_locationId: { productId, locationId } },
    }),
  ]);

  if (!product) {
    throw new Error(`Produit introuvable (ID: ${productId}).`);
  }
  if (!product.isActive) {
    throw new Error(`Le produit "${product.name}" (${product.sku}) est inactif. Vente impossible.`);
  }

  if (!location) {
    throw new Error(`Emplacement introuvable (ID: ${locationId}).`);
  }
  if (!location.isActive) {
    throw new Error(`L'emplacement "${location.name}" est inactif. Impossible de prélever du stock.`);
  }

  const availableQuantity = productStock?.quantity ?? 0;
  if (availableQuantity < quantity) {
    throw new Error(
      `Stock insuffisant pour "${product.name}" au dépôt "${location.name}". ` +
      `Disponible : ${availableQuantity} unité(s), demandé pour la vente : ${quantity} unité(s).`
    );
  }

  const stockBefore = availableQuantity;
  const stockAfter = availableQuantity - quantity;

  // 4. Décrémenter l'emplacement
  await tx.productStock.update({
    where: { productId_locationId: { productId, locationId } },
    data: { quantity: stockAfter },
  });

  // 5. Recalculer le total général du produit (somme de tous les emplacements)
  const allStocks = await tx.productStock.findMany({
    where: { productId },
    select: { quantity: true },
  });
  const newProductTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

  await tx.product.update({
    where: { id: productId },
    data: { stock: newProductTotal },
  });

  // 6. Enregistrement du mouvement de stock
  const clientLabel = customerName?.trim() ? ` - Client : ${customerName.trim()}` : " - Client : Passager / Comptoir";
  const movementRef = `MVT-${saleReference}-${product.sku}`;

  await tx.stockMovement.create({
    data: {
      reference: movementRef,
      type: "SALE",
      productId,
      fromLocationId: locationId,
      toLocationId: null,
      quantity,
      unitCost: product.costPrice,
      stockBefore,
      stockAfter,
      reason: `Sortie pour Vente ${saleReference}`,
      notes: `Facture N° ${saleReference}${clientLabel} (Dépôt : ${location.name})`,
      saleId,
    },
  });

  return {
    productId,
    locationId,
    stockBefore,
    stockAfter,
    newProductTotal,
  };
}

/**
 * Restaure le stock des articles d'une vente annulée dans une transaction atomique.
 */
export async function restoreStockForCancelledSale(
  tx: PrismaTransactionClient,
  params: {
    saleId: number;
    saleReference: string;
    reason: string;
  }
) {
  const { saleId, saleReference, reason } = params;

  // Récupérer les lignes de vente avec emplacement
  const saleItems = await tx.saleItem.findMany({
    where: { saleId },
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true } },
      location: { select: { id: true, name: true } },
    },
  });

  for (const item of saleItems) {
    if (!item.locationId) continue;

    const currentStock = await tx.productStock.findUnique({
      where: {
        productId_locationId: { productId: item.productId, locationId: item.locationId },
      },
    });

    const stockBefore = currentStock?.quantity ?? 0;
    const stockAfter = stockBefore + item.quantity;

    await tx.productStock.upsert({
      where: {
        productId_locationId: { productId: item.productId, locationId: item.locationId },
      },
      create: {
        productId: item.productId,
        locationId: item.locationId,
        quantity: stockAfter,
      },
      update: {
        quantity: stockAfter,
      },
    });

    const allStocks = await tx.productStock.findMany({
      where: { productId: item.productId },
      select: { quantity: true },
    });
    const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

    await tx.product.update({
      where: { id: item.productId },
      data: { stock: newTotal },
    });

    // Mouvement compensatoire
    await tx.stockMovement.create({
      data: {
        reference: `RET-${saleReference}-${item.product.sku}`,
        type: "RECEIPT",
        productId: item.productId,
        fromLocationId: null,
        toLocationId: item.locationId,
        quantity: item.quantity,
        unitCost: item.product.costPrice,
        stockBefore,
        stockAfter,
        reason: `Réintégration suite à annulation vente ${saleReference}`,
        notes: `Motif d'annulation : ${reason}`,
        saleId,
      },
    });
  }
}

/**
 * Réceptionne le stock d'un article de commande fournisseur à un emplacement donné
 * de manière strictement atomique au sein d'une transaction Prisma.
 *
 * - Valide le produit et l'emplacement de destination (doivent être actifs).
 * - Incrémente le ProductStock de l'emplacement de destination.
 * - Recalcule le stock total du produit (somme de tous les emplacements).
 * - Enregistre le mouvement comptable StockMovement de type "RECEIPT" avec stockBefore et stockAfter.
 */
export async function receiveStockForPurchaseItem(
  tx: PrismaTransactionClient,
  params: {
    purchaseId: number;
    purchaseReference: string;
    receiptReference: string;
    productId: number;
    locationId: number;
    quantity: number;
    unitCost?: number | null;
    supplierName?: string | null;
    updateProductCostPrice?: boolean;
  }
) {
  const {
    purchaseId,
    purchaseReference,
    receiptReference,
    productId,
    locationId,
    quantity,
    unitCost,
    supplierName,
    updateProductCostPrice = false,
  } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`La quantité réceptionnée doit être un entier strictement positif (reçu: ${quantity}).`);
  }

  // 1. Validation du produit
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sku: true, costPrice: true, isActive: true },
  });
  if (!product) {
    throw new Error(`Produit introuvable (ID: ${productId}).`);
  }
  if (!product.isActive) {
    throw new Error(`Le produit "${product.name}" (${product.sku}) est inactif. Réception impossible.`);
  }

  // 2. Validation de l'emplacement de destination
  const location = await tx.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!location) {
    throw new Error(`Emplacement de réception introuvable (ID: ${locationId}).`);
  }
  if (!location.isActive) {
    throw new Error(`L'emplacement "${location.name}" est inactif. Impossible d'y réceptionner du stock.`);
  }

  // 3. Récupération et incrémentation du stock à l'emplacement
  const currentStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  const stockBefore = currentStock?.quantity ?? 0;
  const stockAfter = stockBefore + quantity;

  await tx.productStock.upsert({
    where: { productId_locationId: { productId, locationId } },
    create: {
      productId,
      locationId,
      quantity: stockAfter,
    },
    update: {
      quantity: stockAfter,
    },
  });

  // 4. Recalcul du stock global du produit
  const allStocks = await tx.productStock.findMany({
    where: { productId },
    select: { quantity: true },
  });
  const newProductTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

  const productUpdateData: { stock: number; costPrice?: number } = { stock: newProductTotal };
  if (updateProductCostPrice && typeof unitCost === "number" && unitCost > 0) {
    productUpdateData.costPrice = unitCost;
  }

  await tx.product.update({
    where: { id: productId },
    data: productUpdateData,
  });

  // 5. Enregistrement du mouvement de stock immuable
  const supplierLabel = supplierName?.trim() ? ` - Fournisseur : ${supplierName.trim()}` : "";
  const movementRef = `MVT-${receiptReference}-${product.sku}`;

  await tx.stockMovement.create({
    data: {
      reference: movementRef,
      type: "RECEIPT",
      productId,
      fromLocationId: null,
      toLocationId: locationId,
      quantity,
      unitCost: typeof unitCost === "number" ? unitCost : product.costPrice,
      stockBefore,
      stockAfter,
      reason: `Réception Commande ${purchaseReference}`,
      notes: `Bon de Réception ${receiptReference}${supplierLabel} (Dépôt : ${location.name})`,
      purchaseId,
    },
  });

  return { stockBefore, stockAfter, newProductTotal };
}

/**
 * Annule une commande fournisseur en rétablissant le stock des articles déjà réceptionnés.
 * Empêche formellement tout solde négatif.
 */
export async function reverseStockForCancelledPurchase(
  tx: PrismaTransactionClient,
  params: {
    purchaseId: number;
    purchaseReference: string;
    reason: string;
  }
) {
  const { purchaseId, purchaseReference, reason } = params;

  // Récupérer les articles réceptionnés via les réceptions de cette commande
  const receiptItems = await tx.purchaseReceiptItem.findMany({
    where: { receipt: { purchaseId } },
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true } },
      location: { select: { id: true, name: true } },
    },
  });

  // Si pas d'articles de réception explicites, vérifier les purchaseItems avec receivedQuantity > 0
  for (const item of receiptItems) {
    const currentStock = await tx.productStock.findUnique({
      where: {
        productId_locationId: { productId: item.productId, locationId: item.locationId },
      },
    });

    const stockBefore = currentStock?.quantity ?? 0;
    if (stockBefore < item.quantity) {
      throw new Error(
        `Impossible d'annuler la réception : le stock actuel de "${item.product.name}" au dépôt "${item.location.name}" (${stockBefore}) est inférieur à la quantité à déduire (${item.quantity}).`
      );
    }
    const stockAfter = stockBefore - item.quantity;

    await tx.productStock.update({
      where: {
        productId_locationId: { productId: item.productId, locationId: item.locationId },
      },
      data: { quantity: stockAfter },
    });

    const allStocks = await tx.productStock.findMany({
      where: { productId: item.productId },
      select: { quantity: true },
    });
    const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

    await tx.product.update({
      where: { id: item.productId },
      data: { stock: newTotal },
    });

    // Mouvement compensatoire ISSUE
    await tx.stockMovement.create({
      data: {
        reference: `ANN-${purchaseReference}-${item.product.sku}`,
        type: "ISSUE",
        productId: item.productId,
        fromLocationId: item.locationId,
        toLocationId: null,
        quantity: item.quantity,
        unitCost: item.unitCost ?? item.product.costPrice,
        stockBefore,
        stockAfter,
        reason: `Annulation de réception pour commande ${purchaseReference}`,
        notes: `Motif : ${reason}`,
        purchaseId,
      },
    });
  }
}
