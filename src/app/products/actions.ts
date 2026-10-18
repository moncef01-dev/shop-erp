"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

// ─── GÉNÉRATEUR DE RÉFÉRENCE UNIQUE DE MOUVEMENT ─────────────────────────────


function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Silently ignore when called outside Next.js request context (e.g. integration tests)
  }
}
function generateReference(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

// ─── INITIALISATION DES EMPLACEMENTS PAR DÉFAUT ──────────────────────────────

const DEFAULT_LOCATIONS = [
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

export async function ensureDefaultLocations(): Promise<void> {
  for (const loc of DEFAULT_LOCATIONS) {
    const existing = await prisma.location.findUnique({
      where: { code: loc.code },
    });
    if (!existing) {
      await prisma.location.create({
        data: loc,
      });
    }
  }
}

// ─── RÉCUPÉRATION DES DONNÉES DU MODULE PRODUITS & STOCK ─────────────────────

export async function getProductsModuleData() {
  await ensureDefaultLocations();

  const [products, categories, locations, movements] = await Promise.all([
    prisma.product.findMany({
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
    }),
    prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.stockMovement.findMany({
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
    }),
  ]);

  return {
    products,
    categories,
    locations,
    movements,
  };
}

// ─── GESTION DES PRODUITS ───────────────────────────────────────────────────

export async function createProductAction(formData: FormData): Promise<ActionResponse> {
  try {
    const rawSku = (formData.get("sku") as string)?.trim();
    const rawName = (formData.get("name") as string)?.trim();
    const model = (formData.get("model") as string)?.trim() || null;
    const color = (formData.get("color") as string)?.trim() || null;
    const description = (formData.get("description") as string)?.trim() || null;
    const categoryIdStr = formData.get("categoryId") as string;
    const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null;
    
    const costPriceStr = formData.get("costPrice") as string;
    const costPrice = costPriceStr ? parseFloat(costPriceStr) : null;
    
    const sellingPriceStr = formData.get("sellingPrice") as string;
    const sellingPrice = sellingPriceStr ? parseFloat(sellingPriceStr) : 0;
    
    const minStockStr = formData.get("minStock") as string;
    const minStock = minStockStr ? parseInt(minStockStr, 10) : 0;

    // Validation
    if (!rawSku) {
      return { success: false, error: "La référence (SKU) est obligatoire." };
    }
    if (!rawName) {
      return { success: false, error: "Le nom du produit est obligatoire." };
    }
    if (costPrice !== null && (isNaN(costPrice) || costPrice < 0)) {
      return { success: false, error: "Le prix d'achat ne peut pas être négatif." };
    }
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return { success: false, error: "Le prix de vente ne peut pas être négatif." };
    }
    if (isNaN(minStock) || minStock < 0) {
      return { success: false, error: "Le seuil d'alerte de stock ne peut pas être négatif." };
    }

    const cleanSku = rawSku.toUpperCase();

    // Vérifier l'unicité stricte et insensible à la casse du SKU
    const existingSku = await prisma.product.findFirst({
      where: {
        sku: { equals: cleanSku },
      },
    });
    if (existingSku) {
      return {
        success: false,
        error: `La référence "${cleanSku}" est déjà utilisée par le produit "${existingSku.name}". Chaque référence doit être unique.`,
      };
    }

    // Récupérer le nom de la catégorie si présente
    let categoryName: string | null = null;
    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (cat) categoryName = cat.name;
    }

    const product = await prisma.product.create({
      data: {
        sku: cleanSku,
        name: rawName,
        model,
        color,
        description,
        categoryId,
        category: categoryName,
        costPrice,
        sellingPrice,
        unitPrice: sellingPrice,
        minStock,
        stock: 0,
        isActive: true,
      },
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Produit "${product.name}" (${product.sku}) créé avec succès.`,
      data: product,
    };
  } catch (err: unknown) {
    console.error("Erreur création produit:", err);
    return {
      success: false,
      error: "Une erreur est survenue lors de la création du produit.",
    };
  }
}

export async function updateProductAction(formData: FormData): Promise<ActionResponse> {
  try {
    const idStr = formData.get("id") as string;
    if (!idStr) return { success: false, error: "Identifiant du produit manquant." };
    const id = parseInt(idStr, 10);

    const rawSku = (formData.get("sku") as string)?.trim();
    const rawName = (formData.get("name") as string)?.trim();
    const model = (formData.get("model") as string)?.trim() || null;
    const color = (formData.get("color") as string)?.trim() || null;
    const description = (formData.get("description") as string)?.trim() || null;
    const categoryIdStr = formData.get("categoryId") as string;
    const categoryId = categoryIdStr ? parseInt(categoryIdStr, 10) : null;
    
    const costPriceStr = formData.get("costPrice") as string;
    const costPrice = costPriceStr ? parseFloat(costPriceStr) : null;
    
    const sellingPriceStr = formData.get("sellingPrice") as string;
    const sellingPrice = sellingPriceStr ? parseFloat(sellingPriceStr) : 0;
    
    const minStockStr = formData.get("minStock") as string;
    const minStock = minStockStr ? parseInt(minStockStr, 10) : 0;

    const isActive = formData.get("isActive") === "true";

    // Validation
    if (!rawSku) {
      return { success: false, error: "La référence (SKU) est obligatoire." };
    }
    if (!rawName) {
      return { success: false, error: "Le nom du produit est obligatoire." };
    }
    if (costPrice !== null && (isNaN(costPrice) || costPrice < 0)) {
      return { success: false, error: "Le prix d'achat ne peut pas être négatif." };
    }
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return { success: false, error: "Le prix de vente ne peut pas être négatif." };
    }
    if (isNaN(minStock) || minStock < 0) {
      return { success: false, error: "Le seuil d'alerte ne peut pas être négatif." };
    }

    const cleanSku = rawSku.toUpperCase();

    // Vérifier collision SKU (insensible à la casse)
    const existingSku = await prisma.product.findFirst({
      where: {
        sku: { equals: cleanSku },
        NOT: { id },
      },
    });
    if (existingSku) {
      return {
        success: false,
        error: `La référence "${cleanSku}" est déjà utilisée par un autre meuble ("${existingSku.name}").`,
      };
    }

    let categoryName: string | null = null;
    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (cat) categoryName = cat.name;
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        sku: cleanSku,
        name: rawName,
        model,
        color,
        description,
        categoryId,
        category: categoryName,
        costPrice,
        sellingPrice,
        unitPrice: sellingPrice,
        minStock,
        isActive,
      },
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Produit "${updated.name}" mis à jour avec succès.`,
      data: updated,
    };
  } catch (err: unknown) {
    console.error("Erreur modification produit:", err);
    return {
      success: false,
      error: "Une erreur est survenue lors de la modification du produit.",
    };
  }
}

export async function toggleProductStatusAction(id: number): Promise<ActionResponse> {
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return { success: false, error: "Produit introuvable." };

    const newStatus = !product.isActive;
    await prisma.product.update({
      where: { id },
      data: { isActive: newStatus },
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Le produit "${product.name}" est maintenant ${newStatus ? "actif" : "inactif"}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur statut produit:", err);
    return { success: false, error: "Impossible de modifier le statut du produit." };
  }
}

export async function deleteProductAction(id: number): Promise<ActionResponse> {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            movements: true,
            saleItems: true,
            purchaseItems: true,
          },
        },
        stocks: true,
      },
    });

    if (!product) {
      return { success: false, error: "Produit introuvable." };
    }

    // Protection stricte : si le produit a du stock ou des opérations historiques
    const totalStock = product.stocks.reduce((sum, s) => sum + s.quantity, 0);
    const hasHistory =
      product._count.movements > 0 ||
      product._count.saleItems > 0 ||
      product._count.purchaseItems > 0 ||
      totalStock > 0;

    if (hasHistory) {
      return {
        success: false,
        error: `Impossible de supprimer définitivement le meuble "${product.name}" car des opérations ou du stock (${totalStock} unité(s)) y sont rattachés. Pour préserver l'historique et la traçabilité comptable, veuillez plutôt le désactiver.`,
      };
    }

    await prisma.product.delete({
      where: { id },
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Produit "${product.name}" supprimé avec succès.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression produit:", err);
    return {
      success: false,
      error: "Erreur lors de la suppression du produit.",
    };
  }
}

// ─── GESTION DES CATÉGORIES ─────────────────────────────────────────────────

export async function createCategoryAction(formData: FormData): Promise<ActionResponse> {
  try {
    const rawName = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;

    if (!rawName) {
      return { success: false, error: "Le nom de la catégorie est obligatoire." };
    }

    const existing = await prisma.category.findUnique({
      where: { name: rawName },
    });
    if (existing) {
      return {
        success: false,
        error: `La catégorie "${rawName}" existe déjà.`,
      };
    }

    const cat = await prisma.category.create({
      data: { name: rawName, description },
    });

    safeRevalidate("/products");
    return {
      success: true,
      message: `Catégorie "${cat.name}" ajoutée avec succès.`,
      data: cat,
    };
  } catch (err: unknown) {
    console.error("Erreur création catégorie:", err);
    return {
      success: false,
      error: "Erreur lors de la création de la catégorie.",
    };
  }
}

export async function updateCategoryAction(formData: FormData): Promise<ActionResponse> {
  try {
    const idStr = formData.get("id") as string;
    const rawName = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;

    if (!idStr || !rawName) {
      return { success: false, error: "Données de catégorie incomplètes." };
    }
    const id = parseInt(idStr, 10);

    const duplicate = await prisma.category.findFirst({
      where: { name: rawName, NOT: { id } },
    });
    if (duplicate) {
      return {
        success: false,
        error: `Une autre catégorie porte déjà le nom "${rawName}".`,
      };
    }

    const cat = await prisma.category.update({
      where: { id },
      data: { name: rawName, description },
    });

    safeRevalidate("/products");
    return {
      success: true,
      message: `Catégorie "${cat.name}" mise à jour avec succès.`,
      data: cat,
    };
  } catch (err: unknown) {
    console.error("Erreur modification catégorie:", err);
    return {
      success: false,
      error: "Erreur lors de la modification de la catégorie.",
    };
  }
}

export async function deleteCategoryAction(id: number): Promise<ActionResponse> {
  try {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      return { success: false, error: "Catégorie introuvable." };
    }

    if (category._count.products > 0) {
      return {
        success: false,
        error: `Impossible de supprimer la catégorie "${category.name}" car ${category._count.products} meuble(s) y sont rattachés. Veuillez d'abord réaffecter ces produits.`,
      };
    }

    await prisma.category.delete({ where: { id } });

    safeRevalidate("/products");
    return {
      success: true,
      message: `Catégorie "${category.name}" supprimée avec succès.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression catégorie:", err);
    return {
      success: false,
      error: "Erreur lors de la suppression de la catégorie.",
    };
  }
}

// ─── GESTION DES EMPLACEMENTS (GARAGES / SHOWROOM) ──────────────────────────

export async function createLocationAction(formData: FormData): Promise<ActionResponse> {
  try {
    const code = (formData.get("code") as string)?.trim().toUpperCase();
    const name = (formData.get("name") as string)?.trim();
    const address = (formData.get("address") as string)?.trim() || null;
    const isDefault = formData.get("isDefault") === "true";

    if (!code || !name) {
      return { success: false, error: "Le code et le nom de l'emplacement sont obligatoires." };
    }

    const existing = await prisma.location.findUnique({ where: { code } });
    if (existing) {
      return {
        success: false,
        error: `Un emplacement avec le code "${code}" existe déjà (${existing.name}).`,
      };
    }

    if (isDefault) {
      await prisma.location.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const loc = await prisma.location.create({
      data: { code, name, address, isDefault, isActive: true },
    });

    safeRevalidate("/products");
    return {
      success: true,
      message: `Emplacement "${loc.name}" créé avec succès.`,
      data: loc,
    };
  } catch (err: unknown) {
    console.error("Erreur création emplacement:", err);
    return { success: false, error: "Erreur lors de la création de l'emplacement." };
  }
}

export async function updateLocationAction(formData: FormData): Promise<ActionResponse> {
  try {
    const idStr = formData.get("id") as string;
    const name = (formData.get("name") as string)?.trim();
    const address = (formData.get("address") as string)?.trim() || null;
    const isDefault = formData.get("isDefault") === "true";

    if (!idStr || !name) {
      return { success: false, error: "Informations d'emplacement incomplètes." };
    }
    const id = parseInt(idStr, 10);

    if (isDefault) {
      await prisma.location.updateMany({
        where: { id: { not: id }, isDefault: true },
        data: { isDefault: false },
      });
    }

    const loc = await prisma.location.update({
      where: { id },
      data: { name, address, isDefault },
    });

    safeRevalidate("/products");
    return {
      success: true,
      message: `Emplacement "${loc.name}" mis à jour avec succès.`,
      data: loc,
    };
  } catch (err: unknown) {
    console.error("Erreur mise à jour emplacement:", err);
    return { success: false, error: "Erreur lors de la mise à jour de l'emplacement." };
  }
}

export async function toggleLocationStatusAction(id: number): Promise<ActionResponse> {
  try {
    const loc = await prisma.location.findUnique({ where: { id } });
    if (!loc) return { success: false, error: "Emplacement introuvable." };

    // Si on veut désactiver un emplacement par défaut, le refuser
    if (loc.isDefault && loc.isActive) {
      return {
        success: false,
        error: `L'emplacement "${loc.name}" est configuré comme emplacement par défaut. Veuillez d'abord désigner un autre emplacement par défaut avant de désactiver celui-ci.`,
      };
    }

    const newStatus = !loc.isActive;
    await prisma.location.update({
      where: { id },
      data: { isActive: newStatus },
    });

    safeRevalidate("/products");
    return {
      success: true,
      message: `L'emplacement "${loc.name}" est maintenant ${newStatus ? "actif" : "inactif"}. Les stocks historiques restent comptabilisés.`,
    };
  } catch (err: unknown) {
    console.error("Erreur statut emplacement:", err);
    return { success: false, error: "Impossible de modifier le statut de l'emplacement." };
  }
}

export async function deleteLocationAction(id: number): Promise<ActionResponse> {
  try {
    const loc = await prisma.location.findUnique({
      where: { id },
      include: {
        stocks: true,
        sourceMovements: { select: { id: true } },
        destMovements: { select: { id: true } },
      },
    });

    if (!loc) return { success: false, error: "Emplacement introuvable." };

    if (loc.isDefault) {
      return {
        success: false,
        error: `Impossible de supprimer l'emplacement par défaut "${loc.name}".`,
      };
    }

    const totalStockHere = loc.stocks.reduce((sum, s) => sum + s.quantity, 0);
    const hasMovements = loc.sourceMovements.length > 0 || loc.destMovements.length > 0;

    if (totalStockHere > 0 || hasMovements) {
      return {
        success: false,
        error: `Impossible de supprimer physiquement l'emplacement "${loc.name}" car il contient du stock (${totalStockHere} unité(s)) ou des mouvements historiques. Vous pouvez le désactiver pour empêcher de nouvelles opérations tout en préservant l'inventaire.`,
      };
    }

    await prisma.location.delete({ where: { id } });

    safeRevalidate("/products");
    return {
      success: true,
      message: `Emplacement "${loc.name}" supprimé.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression emplacement:", err);
    return { success: false, error: "Erreur lors de la suppression de l'emplacement." };
  }
}

// ─── RÈGLES DE GESTION DU STOCK STRICTEMENT COMPTABLE ─────────────────────────

/**
 * 1. ENTRÉE DE STOCK INITIAL
 * Enregistre le stock d'ouverture d'un produit dans un emplacement.
 * Doit être strictement un nombre entier positif.
 * Ne peut pas être appliqué deux fois si un stock existe déjà (utiliser l'ajustement sinon).
 */
export async function recordInitialStockAction(formData: FormData): Promise<ActionResponse> {
  try {
    const productIdStr = formData.get("productId") as string;
    const locationIdStr = formData.get("locationId") as string;
    const quantityStr = formData.get("quantity") as string;
    const reason = (formData.get("reason") as string)?.trim() || "Stock initial d'ouverture";
    const ref = (formData.get("reference") as string)?.trim() || generateReference("INIT");

    if (!productIdStr || !locationIdStr || !quantityStr) {
      return { success: false, error: "Veuillez sélectionner le produit, l'emplacement et la quantité." };
    }

    const productId = parseInt(productIdStr, 10);
    const locationId = parseInt(locationIdStr, 10);
    const quantity = Number(quantityStr);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: "La quantité initiale doit être un nombre entier strictement positif (supérieur à 0)." };
    }

    const [product, location] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: locationId } }),
    ]);

    if (!product) return { success: false, error: "Produit introuvable." };
    if (!product.isActive) {
      return { success: false, error: `Le produit "${product.name}" est inactif. Impossible d'effectuer une entrée de stock.` };
    }
    if (!location) return { success: false, error: "Emplacement introuvable." };
    if (!location.isActive) {
      return { success: false, error: `L'emplacement "${location.name}" est inactif.` };
    }

    // Transaction atomique
    await prisma.$transaction(async (tx) => {
      // Vérifier si un stock a déjà été saisi pour ce produit à cet emplacement
      const existingStock = await tx.productStock.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });

      if (existingStock && existingStock.quantity > 0) {
        throw new Error(
          `Un stock d'ouverture a déjà été enregistré pour "${product.name}" à "${location.name}" (${existingStock.quantity} unité(s)). Pour corriger ou mettre à jour la quantité, veuillez utiliser l'opération d'Ajustement d'inventaire.`
        );
      }

      const stockBefore = existingStock?.quantity ?? 0;
      const stockAfter = quantity;

      // 1. Mettre à jour / créer la ligne ProductStock
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

      // 2. Recalculer le total strict across all locations
      const allStocks = await tx.productStock.findMany({ where: { productId } });
      const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

      await tx.product.update({
        where: { id: productId },
        data: { stock: newTotal },
      });

      // 3. Enregistrer le mouvement avec avant/après
      await tx.stockMovement.create({
        data: {
          reference: ref,
          type: "INITIAL",
          productId,
          toLocationId: locationId,
          quantity,
          stockBefore,
          stockAfter,
          reason,
          notes: `Stock initial d'ouverture à ${location.name}. Réf : ${ref}`,
          unitCost: product.costPrice,
        },
      });
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Stock initial de ${quantity} unité(s) enregistré avec succès pour "${product.name}" à "${location.name}".`,
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement stock initial:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement du stock initial.";
    return { success: false, error: msg };
  }
}

/**
 * 2. ENTRÉE DE STOCK / RÉCEPTION (AUGMENTE LE STOCK)
 * Augmente la quantité à l'emplacement destination et met à jour le total.
 */
export async function recordStockReceiptAction(formData: FormData): Promise<ActionResponse> {
  try {
    const productIdStr = formData.get("productId") as string;
    const locationIdStr = formData.get("locationId") as string;
    const quantityStr = formData.get("quantity") as string;
    const reason = (formData.get("reason") as string)?.trim();
    const docRef = (formData.get("reference") as string)?.trim() || generateReference("REC");

    if (!productIdStr || !locationIdStr || !quantityStr) {
      return { success: false, error: "Veuillez renseigner le produit, l'emplacement et la quantité." };
    }
    if (!reason) {
      return { success: false, error: "Le motif ou justification de la réception est obligatoire." };
    }

    const productId = parseInt(productIdStr, 10);
    const locationId = parseInt(locationIdStr, 10);
    const quantity = Number(quantityStr);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: "La quantité reçue doit être un nombre entier strictement positif." };
    }

    const [product, location] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: locationId } }),
    ]);

    if (!product) return { success: false, error: "Produit introuvable." };
    if (!product.isActive) {
      return { success: false, error: `Le produit "${product.name}" est inactif. Opération refusée.` };
    }
    if (!location) return { success: false, error: "Emplacement introuvable." };
    if (!location.isActive) {
      return { success: false, error: `L'emplacement "${location.name}" est inactif.` };
    }

    // Transaction atomique
    const result = await prisma.$transaction(async (tx) => {
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

      const allStocks = await tx.productStock.findMany({ where: { productId } });
      const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

      await tx.product.update({
        where: { id: productId },
        data: { stock: newTotal },
      });

      await tx.stockMovement.create({
        data: {
          reference: docRef,
          type: "RECEIPT",
          productId,
          toLocationId: locationId,
          quantity,
          stockBefore,
          stockAfter,
          reason,
          notes: `Réception de +${quantity} à ${location.name}. Réf doc : ${docRef}`,
          unitCost: product.costPrice,
        },
      });

      return { stockAfter, newTotal };
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Réception validée : +${quantity} unité(s) ajoutée(s) pour "${product.name}" à "${location.name}". Nouveau stock emplacement : ${result.stockAfter} (Total magasin : ${result.newTotal}).`,
    };
  } catch (err: unknown) {
    console.error("Erreur réception stock:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la réception de stock.";
    return { success: false, error: msg };
  }
}

/**
 * 3. SORTIE DE STOCK (DIMINUE LE STOCK AVEC JUSTIFICATION)
 * Empêche tout stock négatif et trace la sortie.
 */
export async function recordStockIssueAction(formData: FormData): Promise<ActionResponse> {
  try {
    const productIdStr = formData.get("productId") as string;
    const locationIdStr = formData.get("locationId") as string;
    const quantityStr = formData.get("quantity") as string;
    const reason = (formData.get("reason") as string)?.trim();
    const docRef = (formData.get("reference") as string)?.trim() || generateReference("SRT");

    if (!productIdStr || !locationIdStr || !quantityStr) {
      return { success: false, error: "Veuillez renseigner le produit, l'emplacement et la quantité." };
    }
    if (!reason) {
      return { success: false, error: "Le motif ou la justification de la sortie est obligatoire." };
    }

    const productId = parseInt(productIdStr, 10);
    const locationId = parseInt(locationIdStr, 10);
    const quantity = Number(quantityStr);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: "La quantité sortie doit être un nombre entier strictement positif." };
    }

    const [product, location] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: locationId } }),
    ]);

    if (!product) return { success: false, error: "Produit introuvable." };
    if (!product.isActive) {
      return { success: false, error: `Le produit "${product.name}" est inactif. Opération refusée.` };
    }
    if (!location) return { success: false, error: "Emplacement introuvable." };
    if (!location.isActive) {
      return { success: false, error: `L'emplacement "${location.name}" est inactif.` };
    }

    // Transaction atomique
    const result = await prisma.$transaction(async (tx) => {
      const currentStock = await tx.productStock.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });

      const stockBefore = currentStock?.quantity ?? 0;
      if (stockBefore < quantity) {
        throw new Error(
          `Stock insuffisant à l'emplacement "${location.name}". Stock disponible : ${stockBefore}, quantité demandée pour la sortie : ${quantity}. L'opération a été annulée.`
        );
      }

      const stockAfter = stockBefore - quantity;

      await tx.productStock.update({
        where: { productId_locationId: { productId, locationId } },
        data: { quantity: stockAfter },
      });

      const allStocks = await tx.productStock.findMany({ where: { productId } });
      const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

      await tx.product.update({
        where: { id: productId },
        data: { stock: newTotal },
      });

      await tx.stockMovement.create({
        data: {
          reference: docRef,
          type: "ISSUE",
          productId,
          fromLocationId: locationId,
          quantity,
          stockBefore,
          stockAfter,
          reason,
          notes: `Sortie de -${quantity} depuis ${location.name}. Motif : ${reason}. Réf : ${docRef}`,
          unitCost: product.costPrice,
        },
      });

      return { stockAfter, newTotal };
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Sortie validée : -${quantity} unité(s) retirée(s) pour "${product.name}" à "${location.name}". Nouveau stock emplacement : ${result.stockAfter} (Total magasin : ${result.newTotal}).`,
    };
  } catch (err: unknown) {
    console.error("Erreur sortie stock:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la sortie de stock.";
    return { success: false, error: msg };
  }
}

/**
 * 4. AJUSTEMENT DE STOCK (CORRECTION SUITE À INVENTAIRE OU PERTE)
 * Enregistre explicitement la correction, le stock avant et après, avec motif obligatoire.
 */
export async function recordStockAdjustmentAction(formData: FormData): Promise<ActionResponse> {
  try {
    const productIdStr = formData.get("productId") as string;
    const locationIdStr = formData.get("locationId") as string;
    const quantityStr = formData.get("quantity") as string;
    const isSubtraction = formData.get("isSubtraction") === "true";
    const reason = (formData.get("reason") as string)?.trim();
    const docRef = (formData.get("reference") as string)?.trim() || generateReference("AJUST");

    if (!productIdStr || !locationIdStr || !quantityStr) {
      return { success: false, error: "Champs obligatoires manquants." };
    }
    if (!reason) {
      return { success: false, error: "Le motif ou justification de l'ajustement est obligatoire." };
    }

    const productId = parseInt(productIdStr, 10);
    const locationId = parseInt(locationIdStr, 10);
    const rawQty = Number(quantityStr);

    if (!Number.isInteger(rawQty) || rawQty <= 0) {
      return { success: false, error: "La quantité à ajuster doit être un nombre entier strictement positif." };
    }

    const [product, location] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: locationId } }),
    ]);

    if (!product) return { success: false, error: "Produit introuvable." };
    if (!product.isActive) {
      return { success: false, error: `Le produit "${product.name}" est inactif. Ajustement refusé.` };
    }
    if (!location) return { success: false, error: "Emplacement introuvable." };
    if (!location.isActive) {
      return { success: false, error: `L'emplacement "${location.name}" est inactif.` };
    }

    const delta = isSubtraction ? -rawQty : rawQty;

    // Transaction atomique
    const result = await prisma.$transaction(async (tx) => {
      const existingStock = await tx.productStock.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });

      const stockBefore = existingStock?.quantity ?? 0;
      const stockAfter = stockBefore + delta;

      if (stockAfter < 0) {
        throw new Error(
          `Ajustement impossible : le stock à l'emplacement "${location.name}" est de ${stockBefore}. La déduction de ${rawQty} unité(s) donnerait un stock négatif (${stockAfter}). Le stock ne peut jamais être négatif.`
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

      const allStocks = await tx.productStock.findMany({ where: { productId } });
      const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

      await tx.product.update({
        where: { id: productId },
        data: { stock: newTotal },
      });

      await tx.stockMovement.create({
        data: {
          reference: docRef,
          type: "ADJUSTMENT",
          productId,
          fromLocationId: isSubtraction ? locationId : null,
          toLocationId: isSubtraction ? null : locationId,
          quantity: rawQty,
          stockBefore,
          stockAfter,
          reason,
          notes: `Ajustement (${isSubtraction ? "-" : "+"}${rawQty}) à ${location.name}. Avant: ${stockBefore}, Après: ${stockAfter}. Réf : ${docRef}`,
          unitCost: product.costPrice,
        },
      });

      return { stockBefore, stockAfter, newTotal };
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Ajustement validé : ${isSubtraction ? "-" : "+"}${rawQty} pour "${product.name}" à "${location.name}". Stock passé de ${result.stockBefore} à ${result.stockAfter} (Total magasin : ${result.newTotal}).`,
    };
  } catch (err: unknown) {
    console.error("Erreur ajustement stock:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'ajustement du stock.";
    return { success: false, error: msg };
  }
}

/**
 * 5. TRANSFERT INTER-DÉPÔTS (CONSERVATION STRICTE DU STOCK TOTAL)
 * Déduit atomiquement de la source et ajoute à la destination dans la même transaction.
 * Garantit que Total Stock Source + Dest avant == Total Stock Source + Dest après.
 */
export async function recordStockTransferAction(formData: FormData): Promise<ActionResponse> {
  try {
    const productIdStr = formData.get("productId") as string;
    const fromLocationIdStr = formData.get("fromLocationId") as string;
    const toLocationIdStr = formData.get("toLocationId") as string;
    const quantityStr = formData.get("quantity") as string;
    const reason = (formData.get("reason") as string)?.trim();
    const transferRef = (formData.get("reference") as string)?.trim() || generateReference("TRF");

    if (!productIdStr || !fromLocationIdStr || !toLocationIdStr || !quantityStr) {
      return { success: false, error: "Veuillez spécifier le meuble, le dépôt source, la destination et la quantité." };
    }
    if (!reason) {
      return { success: false, error: "Le motif ou justification du transfert est obligatoire (ex: Réapprovisionnement showroom)." };
    }

    const productId = parseInt(productIdStr, 10);
    const fromLocationId = parseInt(fromLocationIdStr, 10);
    const toLocationId = parseInt(toLocationIdStr, 10);
    const quantity = Number(quantityStr);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: "La quantité à transférer doit être un nombre entier strictement positif." };
    }

    if (fromLocationId === toLocationId) {
      return { success: false, error: "L'emplacement source et la destination doivent être différents." };
    }

    const [product, fromLoc, toLoc] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.location.findUnique({ where: { id: fromLocationId } }),
      prisma.location.findUnique({ where: { id: toLocationId } }),
    ]);

    if (!product) return { success: false, error: "Produit introuvable." };
    if (!product.isActive) {
      return { success: false, error: `Le produit "${product.name}" est inactif. Transfert refusé.` };
    }
    if (!fromLoc) return { success: false, error: "Emplacement source introuvable." };
    if (!fromLoc.isActive) {
      return { success: false, error: `L'emplacement source "${fromLoc.name}" est inactif.` };
    }
    if (!toLoc) return { success: false, error: "Emplacement de destination introuvable." };
    if (!toLoc.isActive) {
      return { success: false, error: `L'emplacement destination "${toLoc.name}" est inactif.` };
    }

    // Transaction atomique stricte
    const result = await prisma.$transaction(async (tx) => {
      // 1. Contrôle du stock source
      const sourceStock = await tx.productStock.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
      });

      const srcBefore = sourceStock?.quantity ?? 0;
      if (srcBefore < quantity) {
        throw new Error(
          `Stock insuffisant à l'emplacement source "${fromLoc.name}". Quantité disponible : ${srcBefore}, quantité demandée pour transfert : ${quantity}. Transfert annulé.`
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
      const allStocks = await tx.productStock.findMany({ where: { productId } });
      const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);

      await tx.product.update({
        where: { id: productId },
        data: { stock: newTotal },
      });

      // 6. Enregistrer le mouvement de transfert unique
      await tx.stockMovement.create({
        data: {
          reference: transferRef,
          type: "TRANSFER",
          productId,
          fromLocationId,
          toLocationId,
          quantity,
          stockBefore: srcBefore,
          stockAfter: srcAfter,
          reason,
          notes: `Transfert de ${quantity} unité(s) de "${fromLoc.name}" vers "${toLoc.name}". Réf : ${transferRef}`,
          unitCost: product.costPrice,
        },
      });

      return { srcAfter, destAfter, newTotal };
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Transfert réussi (${transferRef}) : ${quantity} unité(s) de "${product.name}" transférées de "${fromLoc.name}" (reste: ${result.srcAfter}) vers "${toLoc.name}" (nouveau: ${result.destAfter}). Stock total inchangé (${result.newTotal}).`,
    };
  } catch (err: unknown) {
    console.error("Erreur transfert stock:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors du transfert de stock.";
    return { success: false, error: msg };
  }
}
