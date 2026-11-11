import { prisma, type DbClient, type TxClient } from "@/server/db";

// ─── EMPLACEMENTS (GARAGES / SHOWROOM) ───────────────────────────────────────

export const DEFAULT_LOCATIONS = [
  {
    code: "SHOWROOM",
    name: "Showroom",
    address: "Magasin principal — Espace d'exposition",
    isDefault: true,
  },
  {
    code: "GARAGE_CHAABAN",
    name: "Garage Chaaban",
    address: "Entrepôt Chaaban",
    isDefault: false,
  },
  {
    code: "GARAGE_CHEIKH",
    name: "Garage Cheikh",
    address: "Entrepôt Cheikh",
    isDefault: false,
  },
  {
    code: "GARAGE_3",
    name: "3ème Garage / Dépôt",
    address: "Dépôt secondaire configurable",
    isDefault: false,
  },
];

export async function ensureDefaultLocations(db: DbClient = prisma): Promise<void> {
  for (const loc of DEFAULT_LOCATIONS) {
    const existing = await db.location.findUnique({
      where: { code: loc.code },
    });
    if (!existing) {
      await db.location.create({
        data: loc,
      });
    }
  }
}

export function findLocationsOrdered(db: DbClient = prisma) {
  return db.location.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export function findLocationById(id: number, db: DbClient = prisma) {
  return db.location.findUnique({ where: { id } });
}

export function findLocationByCode(code: string, db: DbClient = prisma) {
  return db.location.findUnique({ where: { code } });
}

export function findProductAndLocationByIds(productId: number, locationId: number, db: DbClient = prisma) {
  return Promise.all([
    db.product.findUnique({ where: { id: productId } }),
    db.location.findUnique({ where: { id: locationId } }),
  ]);
}

export function findProductAndTwoLocationsByIds(
  productId: number,
  fromLocationId: number,
  toLocationId: number,
  db: DbClient = prisma
) {
  return Promise.all([
    db.product.findUnique({ where: { id: productId } }),
    db.location.findUnique({ where: { id: fromLocationId } }),
    db.location.findUnique({ where: { id: toLocationId } }),
  ]);
}

export function clearDefaultLocations(excludeId?: number, db: DbClient = prisma) {
  return db.location.updateMany({
    where: excludeId !== undefined ? { isDefault: true, id: { not: excludeId } } : { isDefault: true },
    data: { isDefault: false },
  });
}

export function createLocation(
  data: { code: string; name: string; address: string | null; isDefault: boolean; isActive: boolean },
  db: DbClient = prisma
) {
  return db.location.create({ data });
}

export function updateLocation(
  id: number,
  data: {
    name?: string;
    address?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
  },
  db: DbClient = prisma
) {
  return db.location.update({ where: { id }, data });
}

export function findLocationWithStockAndMovements(id: number, db: DbClient = prisma) {
  return db.location.findUnique({
    where: { id },
    include: {
      stocks: true,
      sourceMovements: { select: { id: true } },
      destMovements: { select: { id: true } },
    },
  });
}

export function deleteLocation(id: number, db: DbClient = prisma) {
  return db.location.delete({ where: { id } });
}

// ─── RÉFÉRENCE DE DOCUMENT ───────────────────────────────────────────────────

export function generateReference(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

// ─── MOUVEMENTS DE STOCK ─────────────────────────────────────────────────────

export function findRecentMovements(db: DbClient = prisma) {
  return db.stockMovement.findMany({
    take: 200,
    orderBy: { date: "desc" },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          model: true,
          color: true,
          isActive: true,
        },
      },
      fromLocation: { select: { id: true, name: true, code: true, isActive: true } },
      toLocation: { select: { id: true, name: true, code: true, isActive: true } },
    },
  });
}

export function countMovementsSince(since: Date, db: DbClient = prisma) {
  return db.stockMovement.count({
    where: {
      date: {
        gte: since,
      },
    },
  });
}

// ─── OPÉRATIONS DE STOCK (EXÉCUTÉES DANS UNE TRANSACTION) ────────────────────

async function createStockMovement(
  tx: TxClient,
  data: {
    reference: string;
    type: string;
    productId: number;
    fromLocationId?: number | null;
    toLocationId?: number | null;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    reason: string;
    notes: string;
    unitCost: number | null;
  }
) {
  return tx.stockMovement.create({ data });
}

export function findProductStockAtLocation(productId: number, locationId: number, db: DbClient = prisma) {
  return db.productStock.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });
}

async function recomputeProductStockTotal(tx: TxClient, productId: number): Promise<number> {
  const allStocks = await tx.productStock.findMany({
    where: { productId },
    select: { quantity: true },
  });
  return allStocks.reduce((sum, s) => sum + s.quantity, 0);
}

/**
 * 1. ENTRÉE DE STOCK INITIAL — dans une transaction.
 * Rejette un second enregistrement si un stock d'ouverture existe déjà.
 */
export async function applyInitialStock(
  tx: TxClient,
  params: {
    productId: number;
    locationId: number;
    quantity: number;
    reference: string;
    reason: string;
    productName: string;
    locationName: string;
    unitCost: number | null;
  }
) {
  const { productId, locationId, quantity, reference, reason, productName, locationName, unitCost } = params;

  const existingStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  if (existingStock && existingStock.quantity > 0) {
    throw new Error(
      `Un stock d'ouverture a déjà été enregistré pour "${productName}" à "${locationName}" (${existingStock.quantity} unité(s)). Pour corriger ou mettre à jour la quantité, veuillez utiliser l'opération d'Ajustement d'inventaire.`
    );
  }

  const stockBefore = existingStock?.quantity ?? 0;
  const stockAfter = quantity;

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

  const newTotal = await recomputeProductStockTotal(tx, productId);

  await tx.product.update({
    where: { id: productId },
    data: { stock: newTotal },
  });

  await createStockMovement(tx, {
    reference,
    type: "INITIAL",
    productId,
    toLocationId: locationId,
    quantity,
    stockBefore,
    stockAfter,
    reason,
    notes: `Stock initial d'ouverture à ${locationName}. Réf : ${reference}`,
    unitCost,
  });

  return { stockBefore, stockAfter, newTotal };
}

/**
 * 2. ENTRÉE DE STOCK / RÉCEPTION — dans une transaction.
 */
export async function applyStockReceipt(
  tx: TxClient,
  params: {
    productId: number;
    locationId: number;
    quantity: number;
    reference: string;
    reason: string;
    locationName: string;
    unitCost: number | null;
  }
) {
  const { productId, locationId, quantity, reference, reason, locationName, unitCost } = params;

  const existingStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  const stockBefore = existingStock?.quantity ?? 0;
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

  const newTotal = await recomputeProductStockTotal(tx, productId);

  await tx.product.update({
    where: { id: productId },
    data: { stock: newTotal },
  });

  await createStockMovement(tx, {
    reference,
    type: "RECEIPT",
    productId,
    toLocationId: locationId,
    quantity,
    stockBefore,
    stockAfter,
    reason,
    notes: `Réception de +${quantity} à ${locationName}. Réf doc : ${reference}`,
    unitCost,
  });

  return { stockBefore, stockAfter, newTotal };
}

/**
 * 3. SORTIE DE STOCK — dans une transaction.
 * Empêche tout stock négatif.
 */
export async function applyStockIssue(
  tx: TxClient,
  params: {
    productId: number;
    locationId: number;
    quantity: number;
    reference: string;
    reason: string;
    locationName: string;
    unitCost: number | null;
  }
) {
  const { productId, locationId, quantity, reference, reason, locationName, unitCost } = params;

  const currentStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  const stockBefore = currentStock?.quantity ?? 0;
  if (stockBefore < quantity) {
    throw new Error(
      `Stock insuffisant à l'emplacement "${locationName}". Stock disponible : ${stockBefore}, quantité demandée pour la sortie : ${quantity}. L'opération a été annulée.`
    );
  }

  const stockAfter = stockBefore - quantity;

  await tx.productStock.update({
    where: { productId_locationId: { productId, locationId } },
    data: { quantity: stockAfter },
  });

  const newTotal = await recomputeProductStockTotal(tx, productId);

  await tx.product.update({
    where: { id: productId },
    data: { stock: newTotal },
  });

  await createStockMovement(tx, {
    reference,
    type: "ISSUE",
    productId,
    fromLocationId: locationId,
    quantity,
    stockBefore,
    stockAfter,
    reason,
    notes: `Sortie de -${quantity} depuis ${locationName}. Motif : ${reason}. Réf : ${reference}`,
    unitCost,
  });

  return { stockBefore, stockAfter, newTotal };
}

/**
 * 4. AJUSTEMENT DE STOCK — dans une transaction.
 * Interdit tout solde négatif.
 */
export async function applyStockAdjustment(
  tx: TxClient,
  params: {
    productId: number;
    locationId: number;
    rawQuantity: number;
    isSubtraction: boolean;
    reference: string;
    reason: string;
    locationName: string;
    unitCost: number | null;
  }
) {
  const { productId, locationId, rawQuantity, isSubtraction, reference, reason, locationName, unitCost } = params;

  const delta = isSubtraction ? -rawQuantity : rawQuantity;

  const existingStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  const stockBefore = existingStock?.quantity ?? 0;
  const stockAfter = stockBefore + delta;

  if (stockAfter < 0) {
    throw new Error(
      `Ajustement impossible : le stock à l'emplacement "${locationName}" est de ${stockBefore}. La déduction de ${rawQuantity} unité(s) donnerait un stock négatif (${stockAfter}). Le stock ne peut jamais être négatif.`
    );
  }

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

  const newTotal = await recomputeProductStockTotal(tx, productId);

  await tx.product.update({
    where: { id: productId },
    data: { stock: newTotal },
  });

  await createStockMovement(tx, {
    reference,
    type: "ADJUSTMENT",
    productId,
    fromLocationId: isSubtraction ? locationId : null,
    toLocationId: isSubtraction ? null : locationId,
    quantity: rawQuantity,
    stockBefore,
    stockAfter,
    reason,
    notes: `Ajustement (${isSubtraction ? "-" : "+"}${rawQuantity}) à ${locationName}. Avant: ${stockBefore}, Après: ${stockAfter}. Réf : ${reference}`,
    unitCost,
  });

  return { stockBefore, stockAfter, newTotal };
}

/**
 * 5. TRANSFERT INTER-DÉPÔTS — dans une transaction.
 * Conservation stricte du stock total.
 */
export async function applyStockTransfer(
  tx: TxClient,
  params: {
    productId: number;
    fromLocationId: number;
    toLocationId: number;
    quantity: number;
    reference: string;
    reason: string;
    fromLocationName: string;
    toLocationName: string;
    unitCost: number | null;
  }
) {
  const { productId, fromLocationId, toLocationId, quantity, reference, reason, fromLocationName, toLocationName, unitCost } = params;

  // 1. Contrôle du stock source
  const sourceStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId: fromLocationId } },
  });

  const srcBefore = sourceStock?.quantity ?? 0;
  if (srcBefore < quantity) {
    throw new Error(
      `Stock insuffisant à l'emplacement source "${fromLocationName}". Quantité disponible : ${srcBefore}, quantité demandée pour transfert : ${quantity}. Transfert annulé.`
    );
  }

  const srcAfter = srcBefore - quantity;

  // 2. Contrôle du stock destination
  const destStock = await tx.productStock.findUnique({
    where: { productId_locationId: { productId, locationId: toLocationId } },
  });

  const destBefore = destStock?.quantity ?? 0;
  const destAfter = destBefore + quantity;

  // 3. Déduire de la source
  await tx.productStock.update({
    where: { productId_locationId: { productId, locationId: fromLocationId } },
    data: { quantity: srcAfter },
  });

  // 4. Ajouter à la destination
  await tx.productStock.upsert({
    where: { productId_locationId: { productId, locationId: toLocationId } },
    create: {
      productId,
      locationId: toLocationId,
      quantity: destAfter,
    },
    update: {
      quantity: destAfter,
    },
  });

  // 5. Vérifier la stricte conservation du total
  const newTotal = await recomputeProductStockTotal(tx, productId);

  await tx.product.update({
    where: { id: productId },
    data: { stock: newTotal },
  });

  // 6. Enregistrer le mouvement de transfert unique
  await createStockMovement(tx, {
    reference,
    type: "TRANSFER",
    productId,
    fromLocationId,
    toLocationId,
    quantity,
    stockBefore: srcBefore,
    stockAfter: srcAfter,
    reason,
    notes: `Transfert de ${quantity} unité(s) de "${fromLocationName}" vers "${toLocationName}". Réf : ${reference}`,
    unitCost,
  });

  return { srcBefore, srcAfter, destBefore, destAfter, newTotal };
}
