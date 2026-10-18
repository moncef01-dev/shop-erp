"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  receiveStockForPurchaseItem,
  reverseStockForCancelledPurchase,
  PrismaTransactionClient,
} from "@/lib/inventory-transaction";

export type PurchaseActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Silently ignore outside Next.js request context (tests/scripts)
  }
}

// ─── GÉNÉRATION DES RÉFÉRENCES SÉQUENTIELLES IMMUABLES ─────────────────────────

export async function generateNextSupplierCode(txClient?: PrismaTransactionClient): Promise<string> {
  const db = txClient || prisma;
  const lastSupplier = await db.supplier.findFirst({
    where: { code: { startsWith: "FOU-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let nextSeq = 1;
  if (lastSupplier?.code) {
    const parts = lastSupplier.code.split("-");
    const num = parseInt(parts[1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }
  return `FOU-${String(nextSeq).padStart(4, "0")}`;
}

export async function generateNextPurchaseOrderNumber(txClient?: PrismaTransactionClient): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `BC-${yearMonth}-`;

  const lastOrder = await db.purchase.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastOrder?.reference) {
    const parts = lastOrder.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function generateNextReceiptNumber(txClient?: PrismaTransactionClient): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `BR-${yearMonth}-`;

  const lastReceipt = await db.purchaseReceipt.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastReceipt?.reference) {
    const parts = lastReceipt.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function generateNextSupplierPaymentReference(txClient?: PrismaTransactionClient): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PAYF-${yearMonth}-`;

  const lastPayment = await db.payment.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastPayment?.reference) {
    const parts = lastPayment.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── GESTION DES FOURNISSEURS (SUPPLIERS) ────────────────────────────────────

export async function getSuppliersData(searchQuery?: string) {
  const query = searchQuery?.trim();

  const whereClause = query
    ? {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
          { code: { contains: query } },
          { email: { contains: query } },
          { address: { contains: query } },
        ],
      }
    : {};

  const suppliers = await prisma.supplier.findMany({
    where: whereClause,
    include: {
      purchases: {
        where: { status: { not: "cancelled" } },
        select: {
          id: true,
          reference: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          paymentStatus: true,
          receiptStatus: true,
          purchaseDate: true,
        },
        orderBy: { purchaseDate: "desc" },
      },
      _count: {
        select: { purchases: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return suppliers.map((s) => {
    const totalPurchases = s.purchases.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalPaid = s.purchases.reduce((sum, p) => sum + p.paidAmount, 0);
    const outstandingBalance = Math.max(0, totalPurchases - totalPaid);
    const lastPurchase = s.purchases[0];

    return {
      ...s,
      totalPurchases,
      totalPaid,
      outstandingBalance,
      lastPurchaseDate: lastPurchase ? lastPurchase.purchaseDate : null,
      confirmedPurchasesCount: s.purchases.length,
    };
  });
}

export async function createSupplierAction(formData: FormData): Promise<PurchaseActionResponse> {
  try {
    const name = (formData.get("name") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!name || name.length < 2) {
      return { success: false, error: "Le nom ou la raison sociale du fournisseur est obligatoire (au moins 2 caractères)." };
    }

    if (phone) {
      const existing = await prisma.supplier.findFirst({
        where: { phone: { equals: phone } },
      });
      if (existing) {
        return {
          success: false,
          error: `Un fournisseur nommé "${existing.name}" est déjà enregistré avec ce numéro de téléphone (${phone}).`,
        };
      }
    }

    const code = await generateNextSupplierCode();

    const supplier = await prisma.supplier.create({
      data: {
        code,
        name,
        phone,
        email,
        address,
        notes,
        isActive: true,
      },
    });

    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");

    return {
      success: true,
      message: `Fournisseur "${supplier.name}" (${supplier.code}) créé avec succès.`,
      data: supplier,
    };
  } catch (err: unknown) {
    console.error("Erreur création fournisseur:", err);
    return { success: false, error: "Erreur lors de la création du fournisseur." };
  }
}

export async function updateSupplierAction(supplierId: number, formData: FormData): Promise<PurchaseActionResponse> {
  try {
    const name = (formData.get("name") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!name || name.length < 2) {
      return { success: false, error: "Le nom ou la raison sociale du fournisseur est obligatoire." };
    }

    if (phone) {
      const duplicatePhone = await prisma.supplier.findFirst({
        where: {
          phone: { equals: phone },
          id: { not: supplierId },
        },
      });
      if (duplicatePhone) {
        return {
          success: false,
          error: `Le numéro de téléphone (${phone}) est déjà attribué à "${duplicatePhone.name}".`,
        };
      }
    }

    const updated = await prisma.supplier.update({
      where: { id: supplierId },
      data: { name, phone, email, address, notes },
    });

    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");

    return {
      success: true,
      message: `Fournisseur "${updated.name}" mis à jour avec succès.`,
      data: updated,
    };
  } catch (err: unknown) {
    console.error("Erreur modification fournisseur:", err);
    return { success: false, error: "Erreur lors de la mise à jour du fournisseur." };
  }
}

export async function toggleSupplierStatusAction(supplierId: number): Promise<PurchaseActionResponse> {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, isActive: true },
    });
    if (!supplier) return { success: false, error: "Fournisseur introuvable." };

    const newStatus = !supplier.isActive;
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { isActive: newStatus },
    });

    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");

    return {
      success: true,
      message: `Fournisseur "${supplier.name}" ${newStatus ? "activé" : "désactivé"} avec succès.`,
      data: { isActive: newStatus },
    };
  } catch (err: unknown) {
    console.error("Erreur statut fournisseur:", err);
    return { success: false, error: "Erreur lors du changement de statut." };
  }
}

export async function deleteSupplierAction(supplierId: number): Promise<PurchaseActionResponse> {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        _count: { select: { purchases: true } },
      },
    });

    if (!supplier) return { success: false, error: "Fournisseur introuvable." };

    if (supplier._count.purchases > 0) {
      return {
        success: false,
        error: `Impossible de supprimer "${supplier.name}" : ce fournisseur a ${supplier._count.purchases} commande(s) ou facture(s) rattachée(s). Veuillez plutôt le désactiver pour préserver l'historique comptable.`,
      };
    }

    await prisma.supplier.delete({ where: { id: supplierId } });

    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");

    return {
      success: true,
      message: `Fournisseur "${supplier.name}" supprimé définitivement.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression fournisseur:", err);
    return { success: false, error: "Erreur lors de la suppression du fournisseur." };
  }
}

export async function getSupplierDetailsAction(supplierId: number): Promise<PurchaseActionResponse> {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        purchases: {
          include: {
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, model: true, color: true } },
                location: { select: { id: true, name: true, code: true } },
              },
            },
            payments: {
              orderBy: { paymentDate: "desc" },
            },
            receipts: {
              include: {
                items: {
                  include: {
                    product: { select: { id: true, sku: true, name: true } },
                    location: { select: { id: true, name: true } },
                  },
                },
              },
              orderBy: { receiptDate: "desc" },
            },
          },
          orderBy: { purchaseDate: "desc" },
        },
      },
    });

    if (!supplier) return { success: false, error: "Fournisseur introuvable." };

    const totalPurchases = supplier.purchases.reduce(
      (sum, p) => (p.status !== "cancelled" ? sum + p.totalAmount : sum),
      0
    );
    const totalPaid = supplier.purchases.reduce(
      (sum, p) => (p.status !== "cancelled" ? sum + p.paidAmount : sum),
      0
    );
    const outstandingBalance = Math.max(0, totalPurchases - totalPaid);

    return {
      success: true,
      data: {
        ...supplier,
        totalPurchases,
        totalPaid,
        outstandingBalance,
      },
    };
  } catch (err: unknown) {
    console.error("Erreur détails fournisseur:", err);
    return { success: false, error: "Erreur lors de la récupération des détails." };
  }
}

// ─── GESTION DES COMMANDES D'ACHAT (PURCHASES) ──────────────────────────────

export interface CreatePurchaseLineInput {
  productId: number;
  locationId?: number | null;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  supplierId?: number | null;
  purchaseDate?: string;
  expectedDeliveryDate?: string | null;
  status?: "draft" | "ordered";
  notes?: string | null;
  discount?: number;
  items: CreatePurchaseLineInput[];
  initialPayment?: {
    amount: number;
    method: "cash" | "cib" | "check" | "transfer";
    notes?: string;
  };
}

export async function createPurchaseOrderAction(payload: CreatePurchaseInput): Promise<PurchaseActionResponse> {
  try {
    const {
      supplierId = null,
      purchaseDate = new Date().toISOString(),
      expectedDeliveryDate = null,
      status = "ordered",
      notes = null,
      discount = 0,
      items,
      initialPayment,
    } = payload;

    if (!items || items.length === 0) {
      return { success: false, error: "Veuillez ajouter au moins une ligne d'article à la commande." };
    }

    // Validation stricte des lignes
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.productId) {
        return { success: false, error: `Ligne ${i + 1} : Produit obligatoire.` };
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        return { success: false, error: `Ligne ${i + 1} : La quantité doit être un entier strictement positif.` };
      }
      if (typeof it.unitCost !== "number" || it.unitCost < 0) {
        return { success: false, error: `Ligne ${i + 1} : Le prix d'achat unitaire ne peut pas être négatif.` };
      }
    }

    // Calculs stricts des montants côté serveur
    let subtotal = 0;
    const validatedItems = items.map((it) => {
      const lineSubtotal = it.quantity * it.unitCost;
      subtotal += lineSubtotal;
      return {
        ...it,
        subtotal: lineSubtotal,
      };
    });

    const safeDiscount = Math.max(0, discount || 0);
    const totalAmount = Math.max(0, subtotal - safeDiscount);

    // Initialisation paiement initial
    const initialAmount = initialPayment && initialPayment.amount > 0 ? initialPayment.amount : 0;
    if (initialAmount > totalAmount) {
      return { success: false, error: "Le montant du paiement initial ne peut pas dépasser le montant total de la commande." };
    }

    const paymentStatus = initialAmount >= totalAmount && totalAmount > 0 ? "paid" : initialAmount > 0 ? "partial" : "unpaid";

    const result = await prisma.$transaction(async (tx) => {
      // Vérifier le fournisseur
      if (supplierId) {
        const supp = await tx.supplier.findUnique({ where: { id: supplierId } });
        if (!supp) throw new Error("Fournisseur introuvable.");
        if (!supp.isActive) throw new Error(`Le fournisseur "${supp.name}" est inactif.`);
      }

      // Générer référence BC-YYYYMM-XXXX
      const reference = await generateNextPurchaseOrderNumber(tx);

      // Créer la commande
      const purchase = await tx.purchase.create({
        data: {
          reference,
          supplierId,
          status,
          receiptStatus: "pending",
          paymentStatus,
          subtotal,
          discount: safeDiscount,
          totalAmount,
          paidAmount: initialAmount,
          notes: notes?.trim() || null,
          purchaseDate: new Date(purchaseDate),
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
          items: {
            create: validatedItems.map((it) => ({
              productId: it.productId,
              locationId: it.locationId || null,
              quantity: it.quantity,
              receivedQuantity: 0,
              unitCost: it.unitCost,
              subtotal: it.subtotal,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          supplier: true,
        },
      });

      // Enregistrer le paiement initial si fourni
      if (initialAmount > 0 && initialPayment) {
        const payRef = await generateNextSupplierPaymentReference(tx);
        await tx.payment.create({
          data: {
            reference: payRef,
            purchaseId: purchase.id,
            amount: initialAmount,
            method: initialPayment.method || "cash",
            status: "completed",
            notes: initialPayment.notes?.trim() || `Acompte initial sur commande fournisseur ${reference}`,
            paymentDate: new Date(purchaseDate),
          },
        });
      }

      return purchase;
    });

    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");
    safeRevalidate("/cash");

    return {
      success: true,
      message: `Commande fournisseur ${result.reference} créée avec succès.`,
      data: result,
    };
  } catch (err: unknown) {
    console.error("Erreur création commande achat:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la création de la commande.";
    return { success: false, error: msg };
  }
}

// ─── RÉCEPTION DES MARCHANDISES & ENTRÉE EN STOCK (RECEIVING) ─────────────────

export interface ReceiveItemLine {
  purchaseItemId: number;
  locationId: number;
  quantity: number;
  updateProductCostPrice?: boolean;
}

export interface ReceiveGoodsInput {
  purchaseId: number;
  receiptDate?: string;
  notes?: string | null;
  items: ReceiveItemLine[];
}

export async function receivePurchaseGoodsAction(payload: ReceiveGoodsInput): Promise<PurchaseActionResponse> {
  try {
    const { purchaseId, receiptDate = new Date().toISOString(), notes = null, items } = payload;

    if (!items || items.length === 0) {
      return { success: false, error: "Veuillez sélectionner au moins un article et indiquer la quantité à réceptionner." };
    }

    // Validation préalable des quantités
    for (const it of items) {
      if (!it.purchaseItemId || !it.locationId) {
        return { success: false, error: "Article de commande et emplacement de destination obligatoires." };
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        return { success: false, error: "La quantité reçue doit être un nombre entier strictement positif." };
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Récupérer la commande
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      if (!purchase) throw new Error("Commande fournisseur introuvable.");
      if (purchase.status === "cancelled") {
        throw new Error("Impossible de réceptionner des articles pour une commande annulée.");
      }

      // 2. Générer référence unique du bon de réception (BR-YYYYMM-XXXX)
      const receiptRef = await generateNextReceiptNumber(tx);

      // Créer la fiche de réception PurchaseReceipt
      const receipt = await tx.purchaseReceipt.create({
        data: {
          reference: receiptRef,
          purchaseId: purchase.id,
          receiptDate: new Date(receiptDate),
          notes: notes?.trim() || null,
        },
      });

      // 3. Traiter chaque ligne réceptionnée de manière atomique
      for (const receiveLine of items) {
        const pItem = purchase.items.find((pi) => pi.id === receiveLine.purchaseItemId);
        if (!pItem) {
          throw new Error(`Article de commande ID ${receiveLine.purchaseItemId} introuvable dans cette commande.`);
        }

        const remainingToReceive = pItem.quantity - pItem.receivedQuantity;
        if (receiveLine.quantity > remainingToReceive) {
          throw new Error(
            `Quantité excessive pour "${pItem.product.name}" : restant attendu = ${remainingToReceive}, quantité saisie = ${receiveLine.quantity}.`
          );
        }

        // Mettre à jour le stock physique et émettre le mouvement comptable
        await receiveStockForPurchaseItem(tx, {
          purchaseId: purchase.id,
          purchaseReference: purchase.reference,
          receiptReference: receiptRef,
          productId: pItem.productId,
          locationId: receiveLine.locationId,
          quantity: receiveLine.quantity,
          unitCost: pItem.unitCost,
          supplierName: purchase.supplier?.name,
          updateProductCostPrice: Boolean(receiveLine.updateProductCostPrice),
        });

        // Créer l'élément de réception PurchaseReceiptItem
        await tx.purchaseReceiptItem.create({
          data: {
            receiptId: receipt.id,
            purchaseItemId: pItem.id,
            productId: pItem.productId,
            locationId: receiveLine.locationId,
            quantity: receiveLine.quantity,
            unitCost: pItem.unitCost,
          },
        });

        // Incrémenter receivedQuantity sur le PurchaseItem
        await tx.purchaseItem.update({
          where: { id: pItem.id },
          data: {
            receivedQuantity: pItem.receivedQuantity + receiveLine.quantity,
            locationId: receiveLine.locationId,
          },
        });
      }

      // 4. Mettre à jour le statut global de réception et statut de la commande
      const refreshedItems = await tx.purchaseItem.findMany({ where: { purchaseId: purchase.id } });
      const totalOrdered = refreshedItems.reduce((acc, it) => acc + it.quantity, 0);
      const totalReceived = refreshedItems.reduce((acc, it) => acc + it.receivedQuantity, 0);

      let newReceiptStatus = "pending";
      let newOrderStatus = purchase.status;

      if (totalReceived >= totalOrdered) {
        newReceiptStatus = "received";
        newOrderStatus = "received";
      } else if (totalReceived > 0) {
        newReceiptStatus = "partial";
        newOrderStatus = "partially_received";
      }

      const updatedPurchase = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          receiptStatus: newReceiptStatus,
          status: newOrderStatus,
        },
      });

      // 5. Récupérer le bon de réception complet avec ses lignes, produits et emplacements
      const fullReceipt = await tx.purchaseReceipt.findUnique({
        where: { id: receipt.id },
        include: {
          purchase: {
            include: { supplier: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true },
              },
              location: {
                select: { id: true, name: true, code: true },
              },
              purchaseItem: {
                select: { id: true, quantity: true, unitCost: true },
              },
            },
          },
        },
      });

      return { receipt: fullReceipt || receipt, purchase: updatedPurchase, totalReceived, totalOrdered };
    });

    safeRevalidate("/purchases");
    safeRevalidate("/products");
    safeRevalidate("/suppliers");

    return {
      success: true,
      message: `Bon de réception ${result.receipt.reference} enregistré. Les stocks ont été incrémentés (${result.totalReceived}/${result.totalOrdered} unités reçues).`,
      data: result.receipt,
    };
  } catch (err: unknown) {
    console.error("Erreur réception marchandises:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la réception des marchandises.";
    return { success: false, error: msg };
  }
}

export async function getReceiptDetailsAction(receiptId: number): Promise<PurchaseActionResponse> {
  try {
    const receipt = await prisma.purchaseReceipt.findUnique({
      where: { id: receiptId },
      include: {
        purchase: {
          include: {
            supplier: true,
          },
        },
        items: {
          include: {
            product: {
              select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true },
            },
            location: {
              select: { id: true, name: true, code: true },
            },
            purchaseItem: {
              select: { id: true, quantity: true, unitCost: true },
            },
          },
        },
      },
    });

    if (!receipt) {
      return { success: false, error: "Bon de réception introuvable." };
    }

    return {
      success: true,
      data: receipt,
    };
  } catch (err: unknown) {
    console.error("Erreur récupération détails bon de réception:", err);
    return { success: false, error: "Erreur lors de la récupération des détails du bon de réception." };
  }
}

// ─── RÈGLEMENT FOURNISSEUR (PAYMENTS & DETTES) ──────────────────────────────

export async function recordSupplierPaymentAction(formData: FormData): Promise<PurchaseActionResponse> {
  try {
    const purchaseIdStr = formData.get("purchaseId") as string;
    const amountStr = formData.get("amount") as string;
    const method = (formData.get("method") as string) || "cash";
    const notes = (formData.get("notes") as string)?.trim() || null;
    const paymentDateStr = formData.get("paymentDate") as string;

    if (!purchaseIdStr || !amountStr || amountStr.trim() === "") {
      return { success: false, error: "La commande et le montant du règlement sont obligatoires." };
    }

    const purchaseId = parseInt(purchaseIdStr, 10);
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant du règlement doit être un nombre strictement supérieur à 0 DA." };
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { supplier: true },
    });

    if (!purchase) return { success: false, error: "Commande introuvable." };
    if (purchase.status === "cancelled") {
      return { success: false, error: "Impossible d'enregistrer un paiement sur une commande annulée." };
    }

    const remainingBalance = Math.max(0, purchase.totalAmount - purchase.paidAmount);
    if (amount > remainingBalance) {
      return {
        success: false,
        error: `Le montant saisi (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA). Les trop-perçus ne sont pas autorisés.`,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const payRef = await generateNextSupplierPaymentReference(tx);
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();

      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          purchaseId: purchase.id,
          amount,
          method,
          status: "completed",
          notes: notes || `Règlement commande fournisseur ${purchase.reference}`,
          paymentDate,
        },
      });

      const newPaid = purchase.paidAmount + amount;
      const newPaymentStatus = newPaid >= purchase.totalAmount ? "paid" : "partial";

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: newPaymentStatus,
        },
      });

      return { payment, newPaid, newPaymentStatus };
    });

    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");
    safeRevalidate("/cash");

    const newBalance = Math.max(0, purchase.totalAmount - result.newPaid);
    return {
      success: true,
      message: `Paiement fournisseur de ${amount.toLocaleString("fr-DZ")} DA validé (Réf: ${result.payment.reference}). Reste à régler : ${newBalance.toLocaleString("fr-DZ")} DA.`,
      data: result.payment,
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement règlement fournisseur:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement du règlement.";
    return { success: false, error: msg };
  }
}

// ─── ANNULATION DE COMMANDE FOURNISSEUR ──────────────────────────────────────

export async function cancelPurchaseOrderAction(purchaseId: number, reason: string): Promise<PurchaseActionResponse> {
  try {
    const trimmedReason = reason?.trim();
    if (!trimmedReason || trimmedReason.length < 3) {
      return { success: false, error: "Le motif d'annulation est obligatoire (au moins 3 caractères)." };
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        items: true,
        receipts: true,
        payments: true,
      },
    });

    if (!purchase) return { success: false, error: "Commande fournisseur introuvable." };
    if (purchase.status === "cancelled") {
      return { success: false, error: "Cette commande est déjà annulée." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Si des marchandises ont été réceptionnées, réintégrer / déduire le stock
      const hasReceivedItems = purchase.items.some((it) => it.receivedQuantity > 0);
      if (hasReceivedItems) {
        await reverseStockForCancelledPurchase(tx, {
          purchaseId: purchase.id,
          purchaseReference: purchase.reference,
          reason: trimmedReason,
        });
      }

      // 2. Annuler les paiements associés
      await tx.payment.updateMany({
        where: { purchaseId: purchase.id },
        data: { status: "cancelled", notes: `Annulé : ${trimmedReason}` },
      });

      // 3. Mettre à jour le statut
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "cancelled",
          notes: purchase.notes
            ? `${purchase.notes}\n[Annulé le ${new Date().toLocaleDateString("fr-DZ")} : ${trimmedReason}]`
            : `[Annulé le ${new Date().toLocaleDateString("fr-DZ")} : ${trimmedReason}]`,
        },
      });
    });

    safeRevalidate("/purchases");
    safeRevalidate("/products");
    safeRevalidate("/suppliers");

    return {
      success: true,
      message: `La commande ${purchase.reference} a été annulée. Tout stock précédemment réceptionné a été compensé.`,
    };
  } catch (err: unknown) {
    console.error("Erreur annulation commande achat:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'annulation de la commande.";
    return { success: false, error: msg };
  }
}

// ─── RÉCUPÉRATION GLOBALE DES DONNÉES ACHATS & FOURNISSEURS ─────────────────

export async function getPurchasesData(searchQuery?: string) {
  const query = searchQuery?.trim();

  const whereClause = query
    ? {
        OR: [
          { reference: { contains: query } },
          { supplier: { name: { contains: query } } },
          { supplier: { code: { contains: query } } },
          { notes: { contains: query } },
        ],
      }
    : {};

  const purchases = await prisma.purchase.findMany({
    where: whereClause,
    include: {
      supplier: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              model: true,
              color: true,
              costPrice: true,
              sellingPrice: true,
              stock: true,
            },
          },
          location: {
            select: { id: true, name: true, code: true },
          },
        },
      },
      receipts: {
        include: {
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true },
              },
              location: {
                select: { id: true, name: true, code: true },
              },
              purchaseItem: {
                select: { id: true, quantity: true, unitCost: true },
              },
            },
          },
        },
        orderBy: { receiptDate: "desc" },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
    orderBy: { purchaseDate: "desc" },
  });

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, phone: true, address: true },
    orderBy: { name: "asc" },
  });

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      model: true,
      color: true,
      costPrice: true,
      sellingPrice: true,
      stock: true,
    },
    orderBy: { name: "asc" },
  });

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  // Métriques globales
  const confirmedPurchases = purchases.filter((p) => p.status !== "cancelled");
  const totalPurchasesAmount = confirmedPurchases.reduce((acc, p) => acc + p.totalAmount, 0);
  const totalPaidAmount = confirmedPurchases.reduce((acc, p) => acc + p.paidAmount, 0);
  const totalOutstandingDebt = Math.max(0, totalPurchasesAmount - totalPaidAmount);
  const pendingReceiptsCount = purchases.filter((p) => p.status !== "cancelled" && p.receiptStatus !== "received").length;

  const allSuppliers = await getSuppliersData();
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

  return {
    purchases,
    suppliers,
    allSuppliers,
    products,
    locations,
    settings,
    metrics: {
      totalPurchasesAmount,
      totalPaidAmount,
      totalOutstandingDebt,
      totalOrdersCount: confirmedPurchases.length,
      pendingReceiptsCount,
    },
  };
}
