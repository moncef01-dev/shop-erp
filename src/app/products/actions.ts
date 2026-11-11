"use server";

import {
  findProductsForModule,
  findCategoriesWithProductCounts,
  findCategoryById,
  findCategoryByName,
  findCategoryByNameExcluding,
  createCategory,
  updateCategory,
  findCategoryWithProductCount,
  deleteCategory,
  generateNextProductSku,
  findProductBySku,
  findProductBySkuExcluding,
  findProductById,
  findProductWithHistory,
  createProduct,
  updateProduct,
  deleteProductWithStockTx,
} from "@/server/repositories/catalog.repository";
import {
  ensureDefaultLocations as ensureDefaultLocationsRepo,
  findLocationsOrdered,
  findLocationById,
  findLocationByCode,
  findProductAndLocationByIds,
  findProductAndTwoLocationsByIds,
  clearDefaultLocations,
  createLocation,
  updateLocation,
  findLocationWithStockAndMovements,
  deleteLocation,
  findRecentMovements,
  countMovementsSince,
  applyInitialStock,
  applyStockReceipt,
  applyStockIssue,
  applyStockAdjustment,
  applyStockTransfer,
  generateReference,
} from "@/server/repositories/inventory.repository";
import { prisma } from "@/server/db";
import { revalidatePath } from "next/cache";
import { assertPeriodNotLocked } from "@/server/services/period-lock";

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

// ─── INITIALISATION DES EMPLACEMENTS PAR DÉFAUT ──────────────────────────────

export async function ensureDefaultLocations(): Promise<void> {
  await ensureDefaultLocationsRepo();
}

// ─── RÉCUPÉRATION DES DONNÉES DU MODULE PRODUITS & STOCK ─────────────────────

export async function getProductsModuleData() {
  await ensureDefaultLocationsRepo();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [products, categories, locations, movements, todayMovementsCount] = await Promise.all([
    findProductsForModule(),
    findCategoriesWithProductCounts(),
    findLocationsOrdered(),
    findRecentMovements(),
    countMovementsSince(todayStart),
  ]);

  return {
    products,
    categories,
    locations,
    movements,
    todayMovementsCount,
  };
}

// ─── GESTION DES PRODUITS & GÉNÉRATION AUTOMATIQUE DU SKU ───────────────────────

export async function generateNextProductSkuAction(
  categoryId?: number | null
): Promise<{ success: boolean; sku: string }> {
  try {
    const sku = await generateNextProductSku(categoryId);
    return { success: true, sku };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erreur génération SKU";
    return { success: false, sku: "" };
  }
}

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

    // Référence (SKU) : fournie ou générée automatiquement selon convention
    const cleanSku = rawSku ? rawSku.toUpperCase() : await generateNextProductSku(categoryId);

    // Vérifier l'unicité stricte et insensible à la casse du SKU (inclut tous les statuts)
    const existingSku = await findProductBySku(cleanSku);
    if (existingSku) {
      return {
        success: false,
        error: `La référence "${cleanSku}" est déjà utilisée par le produit "${existingSku.name}". Chaque référence doit être unique.`,
      };
    }

    // Récupérer le nom de la catégorie si présente
    let categoryName: string | null = null;
    if (categoryId) {
      const cat = await findCategoryById(categoryId);
      if (cat) categoryName = cat.name;
    }

    const product = await createProduct({
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

    const isActiveRaw = formData.get("isActive");
    const isActive = isActiveRaw === null ? true : isActiveRaw === "true";

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
    const existingSku = await findProductBySkuExcluding(cleanSku, id);
    if (existingSku) {
      return {
        success: false,
        error: `La référence "${cleanSku}" est déjà utilisée par un autre meuble ("${existingSku.name}").`,
      };
    }

    let categoryName: string | null = null;
    if (categoryId) {
      const cat = await findCategoryById(categoryId);
      if (cat) categoryName = cat.name;
    }

    const updated = await updateProduct(id, {
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
    const product = await findProductById(id);
    if (!product) return { success: false, error: "Produit introuvable." };

    const newStatus = !product.isActive;
    await updateProduct(id, { isActive: newStatus });

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
    const product = await findProductWithHistory(id);

    if (!product) {
      return { success: false, error: "Produit introuvable." };
    }

    const totalStock = product.stocks.reduce((sum, s) => sum + s.quantity, 0);
    const hasHistoricalTransactions =
      product._count.movements > 0 ||
      product._count.saleItems > 0 ||
      product._count.purchaseItems > 0 ||
      product._count.purchaseReceiptItems > 0;

    // Si le produit a un historique d'opérations commerciales ou de mouvements de stock :
    // Utiliser l'archivage (soft-delete) pour préserver l'intégrité référentielle et la traçabilité comptable
    if (hasHistoricalTransactions) {
      await updateProduct(id, {
        isActive: false,
      });

      safeRevalidate("/products");
      safeRevalidate("/sales");
      safeRevalidate("/purchases");
      safeRevalidate("/");

      const stockDetail =
        totalStock !== 0
          ? ` (Stock restant conservé pour l'audit d'inventaire : ${totalStock} unité(s))`
          : "";

      return {
        success: true,
        message: `Le meuble "${product.name}" possède un historique comptable/commercial : il a été archivé et retiré du catalogue actif avec succès${stockDetail}.`,
        data: { action: "archived", totalStock },
      };
    }

    // Si le produit n'a aucun historique d'opérations commerciales ou de mouvements :
    // Suppression définitive propre avec nettoyage de ses enregistrements d'emplacements de stock
    await prisma.$transaction(async (tx) => {
      await deleteProductWithStockTx(id, tx);
    });

    safeRevalidate("/products");
    safeRevalidate("/sales");
    safeRevalidate("/purchases");
    safeRevalidate("/");

    return {
      success: true,
      message: `Meuble "${product.name}" supprimé définitivement avec succès.`,
      data: { action: "deleted", totalStock },
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

    const existing = await findCategoryByName(rawName);
    if (existing) {
      return {
        success: false,
        error: `La catégorie "${rawName}" existe déjà.`,
      };
    }

    const cat = await createCategory({ name: rawName, description });

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

    const duplicate = await findCategoryByNameExcluding(rawName, id);
    if (duplicate) {
      return {
        success: false,
        error: `Une autre catégorie porte déjà le nom "${rawName}".`,
      };
    }

    const cat = await updateCategory(id, { name: rawName, description });

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
    const category = await findCategoryWithProductCount(id);

    if (!category) {
      return { success: false, error: "Catégorie introuvable." };
    }

    if (category._count.products > 0) {
      return {
        success: false,
        error: `Impossible de supprimer la catégorie "${category.name}" car ${category._count.products} meuble(s) y sont rattachés. Veuillez d'abord réaffecter ces produits.`,
      };
    }

    await deleteCategory(id);

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

    const existing = await findLocationByCode(code);
    if (existing) {
      return {
        success: false,
        error: `Un emplacement avec le code "${code}" existe déjà (${existing.name}).`,
      };
    }

    if (isDefault) {
      await clearDefaultLocations();
    }

    const loc = await createLocation({ code, name, address, isDefault, isActive: true });

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
      await clearDefaultLocations(id);
    }

    const loc = await updateLocation(id, { name, address, isDefault });

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
    const loc = await findLocationById(id);
    if (!loc) return { success: false, error: "Emplacement introuvable." };

    // Si on veut désactiver un emplacement par défaut, le refuser
    if (loc.isDefault && loc.isActive) {
      return {
        success: false,
        error: `L'emplacement "${loc.name}" est configuré comme emplacement par défaut. Veuillez d'abord désigner un autre emplacement par défaut avant de désactiver celui-ci.`,
      };
    }

    const newStatus = !loc.isActive;
    await updateLocation(id, { isActive: newStatus });

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
    const loc = await findLocationWithStockAndMovements(id);

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

    await deleteLocation(id);

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
    const date = formData.get("date") ? new Date(formData.get("date") as string) : new Date();

    await assertPeriodNotLocked(date, "Enregistrement de stock initial");

    if (!productIdStr || !locationIdStr || !quantityStr) {
      return { success: false, error: "Veuillez sélectionner le produit, l'emplacement et la quantité." };
    }

    const productId = parseInt(productIdStr, 10);
    const locationId = parseInt(locationIdStr, 10);
    const quantity = Number(quantityStr);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: "La quantité initiale doit être un nombre entier strictement positif (supérieur à 0)." };
    }

    const [product, location] = await findProductAndLocationByIds(productId, locationId);

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
      await applyInitialStock(tx, {
        productId,
        locationId,
        quantity,
        reference: ref,
        reason,
        productName: product.name,
        locationName: location.name,
        unitCost: product.costPrice,
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
    const date = formData.get("date") ? new Date(formData.get("date") as string) : new Date();

    await assertPeriodNotLocked(date, "Réception de stock");

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

    const [product, location] = await findProductAndLocationByIds(productId, locationId);

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
      return applyStockReceipt(tx, {
        productId,
        locationId,
        quantity,
        reference: docRef,
        reason,
        locationName: location.name,
        unitCost: product.costPrice,
      });
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
    const date = formData.get("date") ? new Date(formData.get("date") as string) : new Date();

    await assertPeriodNotLocked(date, "Sortie de stock");

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

    const [product, location] = await findProductAndLocationByIds(productId, locationId);

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
      return applyStockIssue(tx, {
        productId,
        locationId,
        quantity,
        reference: docRef,
        reason,
        locationName: location.name,
        unitCost: product.costPrice,
      });
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
    const date = formData.get("date") ? new Date(formData.get("date") as string) : new Date();

    await assertPeriodNotLocked(date, "Ajustement de stock");

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

    const [product, location] = await findProductAndLocationByIds(productId, locationId);

    if (!product) return { success: false, error: "Produit introuvable." };
    if (!product.isActive) {
      return { success: false, error: `Le produit "${product.name}" est inactif. Ajustement refusé.` };
    }
    if (!location) return { success: false, error: "Emplacement introuvable." };
    if (!location.isActive) {
      return { success: false, error: `L'emplacement "${location.name}" est inactif.` };
    }

    // Transaction atomique
    const result = await prisma.$transaction(async (tx) => {
      return applyStockAdjustment(tx, {
        productId,
        locationId,
        rawQuantity: rawQty,
        isSubtraction,
        reference: docRef,
        reason,
        locationName: location.name,
        unitCost: product.costPrice,
      });
    });

    safeRevalidate("/products");
    safeRevalidate("/");
    return {
      success: true,
      message: `Ajustement validé : ${isSubtraction ? "-" : "+"}${rawQty} pour "${product.name}" à "${location.name}". Stock passé de ${result.stockBefore} à ${result.stockAfter} (Total magasin : ${result.newTotal}).`,
    };
  } catch (err: unknown) {
    console.error("Erreur ajustement stock:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'ajustement de stock.";
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
    const date = formData.get("date") ? new Date(formData.get("date") as string) : new Date();

    await assertPeriodNotLocked(date, "Transfert de stock");

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

    const [product, fromLoc, toLoc] = await findProductAndTwoLocationsByIds(productId, fromLocationId, toLocationId);

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
      return applyStockTransfer(tx, {
        productId,
        fromLocationId,
        toLocationId,
        quantity,
        reference: transferRef,
        reason,
        fromLocationName: fromLoc.name,
        toLocationName: toLoc.name,
        unitCost: product.costPrice,
      });
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
