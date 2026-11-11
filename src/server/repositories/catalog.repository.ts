import { prisma, type DbClient, type TxClient } from "@/server/db";

export async function findProductsForModule(db: DbClient = prisma) {
  return db.product.findMany({
    include: {
      categoryRef: true,
      stocks: {
        include: {
          location: true,
        },
      },
      _count: {
        select: {
          movements: true,
          saleItems: true,
          purchaseItems: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function findCategoriesWithProductCounts(db: DbClient = prisma) {
  return db.category.findMany({
    include: {
      _count: {
        select: { products: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export function findCategoryById(id: number, db: DbClient = prisma) {
  return db.category.findUnique({ where: { id } });
}

export function findCategoryByName(name: string, db: DbClient = prisma) {
  return db.category.findUnique({ where: { name } });
}

export function findCategoryByNameExcluding(name: string, excludeId: number, db: DbClient = prisma) {
  return db.category.findFirst({
    where: { name, NOT: { id: excludeId } },
  });
}

export function createCategory(
  data: { name: string; description: string | null },
  db: DbClient = prisma
) {
  return db.category.create({ data });
}

export function updateCategory(
  id: number,
  data: { name: string; description: string | null },
  db: DbClient = prisma
) {
  return db.category.update({ where: { id }, data });
}

export function findCategoryWithProductCount(id: number, db: DbClient = prisma) {
  return db.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
    },
  });
}

export function deleteCategory(id: number, db: DbClient = prisma) {
  return db.category.delete({ where: { id } });
}

/**
 * Génère automatiquement la référence SKU selon la convention de la boutique :
 * - Préfixe = 1ère lettre alphabétique de la catégorie en majuscule (A=Armoire, F=Fauteuil, T=Table, etc.) ou 'ART' si aucune.
 * - Suffixe numérique séquentiel formaté sur au moins 3 chiffres (ex: F102, T093, A003).
 * - Garantit une unicité stricte contre TOUS les produits de la base (actifs ET archivés/inactifs).
 */
export async function generateNextProductSku(
  categoryId?: number | null,
  db: DbClient = prisma
): Promise<string> {
  let prefix = "ART";
  if (categoryId) {
    const cat = await db.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    if (cat?.name) {
      const normalized = cat.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const firstChar = normalized.charAt(0).toUpperCase();
      if (/^[A-Z]$/.test(firstChar)) {
        prefix = firstChar;
      }
    }
  }

  // Récupérer toutes les références existantes pour garantir l'unicité globale (y compris archivés)
  const allProducts = await db.product.findMany({
    select: { sku: true },
  });

  const existingSkus = new Set(allProducts.map((p) => p.sku.toUpperCase()));

  let maxNum = 0;
  const prefixRegex = new RegExp(`^${prefix}(\\d+)$`, "i");

  for (const p of allProducts) {
    const match = p.sku.match(prefixRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let candidateNum = maxNum + 1;
  let candidate = `${prefix}${String(candidateNum).padStart(3, "0")}`;

  while (existingSkus.has(candidate.toUpperCase())) {
    candidateNum++;
    candidate = `${prefix}${String(candidateNum).padStart(3, "0")}`;
  }

  return candidate;
}

export function findProductBySku(sku: string, db: DbClient = prisma) {
  return db.product.findFirst({
    where: { sku: { equals: sku } },
  });
}

export function findProductBySkuExcluding(sku: string, excludeId: number, db: DbClient = prisma) {
  return db.product.findFirst({
    where: {
      sku: { equals: sku },
      NOT: { id: excludeId },
    },
  });
}

export function findProductById(id: number, db: DbClient = prisma) {
  return db.product.findUnique({ where: { id } });
}

export function findProductWithHistory(id: number, db: DbClient = prisma) {
  return db.product.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          movements: true,
          saleItems: true,
          purchaseItems: true,
          purchaseReceiptItems: true,
        },
      },
      stocks: true,
    },
  });
}

export function createProduct(
  data: {
    sku: string;
    name: string;
    model: string | null;
    color: string | null;
    description: string | null;
    categoryId: number | null;
    category: string | null;
    costPrice: number | null;
    sellingPrice: number;
    unitPrice: number;
    minStock: number;
    stock: number;
    isActive: boolean;
  },
  db: DbClient = prisma
) {
  return db.product.create({ data });
}

export function updateProduct(
  id: number,
  data: {
    sku?: string;
    name?: string;
    model?: string | null;
    color?: string | null;
    description?: string | null;
    categoryId?: number | null;
    category?: string | null;
    costPrice?: number | null;
    sellingPrice?: number;
    unitPrice?: number;
    minStock?: number;
    stock?: number;
    isActive?: boolean;
  },
  db: DbClient = prisma
) {
  return db.product.update({ where: { id }, data });
}

export async function deleteProductWithStockTx(productId: number, tx: TxClient) {
  await tx.productStock.deleteMany({
    where: { productId },
  });
  await tx.product.delete({
    where: { id: productId },
  });
}
