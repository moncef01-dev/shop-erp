"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  deductStockForSaleItem,
  restoreStockForCancelledSale,
  type PrismaTransactionClient,
} from "@/lib/inventory-transaction";

export type SaleActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Silently ignore outside Next.js request context
  }
}

// ─── GÉNÉRATEUR DE NUMÉROS UNIQUES DE FACTURE & PAIEMENT ─────────────────────

async function generateNextInvoiceNumber(tx: PrismaTransactionClient, isDraft: boolean): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = isDraft ? `DEV-${yearMonth}-` : `FAC-${yearMonth}-`;

  const lastSale = await tx.sales.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastSale?.reference) {
    const parts = lastSale.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

async function generateNextPaymentReference(tx: PrismaTransactionClient): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PAY-${yearMonth}-`;

  const lastPayment = await tx.payment.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastPayment?.reference) {
    const parts = lastPayment.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

async function generateNextDeliveryReference(tx: PrismaTransactionClient): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `LIV-${yearMonth}-`;

  const lastDelivery = await tx.delivery.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastDelivery?.reference) {
    const parts = lastDelivery.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── RÉCUPÉRATION GLOBALE DES DONNÉES DU MODULE VENTES ────────────────────────

export async function getSalesModuleData() {
  const [sales, customers, products, locations] = await Promise.all([
    prisma.sales.findMany({
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                model: true,
                color: true,
                sellingPrice: true,
              },
            },
            location: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
        },
        deliveries: {
          orderBy: { createdAt: "desc" },
        },
        movements: true,
      },
      orderBy: { saleDate: "desc" },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        categoryRef: true,
        stocks: {
          include: {
            location: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  ]);

  // Statistiques calculées à partir des enregistrements réels
  const confirmedSales = sales.filter((s) => s.status === "confirmed");
  const totalRevenue = confirmedSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const totalCollected = confirmedSales.reduce((acc, s) => acc + s.paidAmount, 0);
  const totalOutstandingCredit = Math.max(0, totalRevenue - totalCollected);
  const pendingDeliveriesCount = sales.reduce((count, s) => {
    const hasPending = s.deliveries.some((d) => d.status === "pending" || d.status === "in_transit");
    return count + (hasPending ? 1 : 0);
  }, 0);

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

  return {
    sales,
    customers,
    products,
    locations,
    settings,
    metrics: {
      totalRevenue,
      totalCollected,
      totalOutstandingCredit,
      totalSalesCount: confirmedSales.length,
      pendingDeliveriesCount,
    },
  };
}

// ─── TYPES D'ENTRÉE POUR LA CRÉATION D'UNE VENTE ─────────────────────────────

export interface SaleItemInput {
  productId: number;
  locationId: number;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CreateSaleInput {
  customerId?: number | null;
  saleDate?: string;
  status: "confirmed" | "draft";
  notes?: string | null;
  deliveryFee?: number;
  discount?: number;
  items: SaleItemInput[];
  initialPayment?: {
    amount: number;
    method: "cash" | "cib" | "check" | "transfer";
    notes?: string;
  };
  delivery?: {
    hasDelivery: boolean;
    method?: "home_delivery" | "store_pickup";
    fee: number;
    address: string;
    plannedDate?: string;
    notes?: string;
    recipientName?: string;
    carrierName?: string;
  };
}

// ─── CRÉATION D'UNE VENTE / FACTURE ──────────────────────────────────────────

export async function createSaleAction(payload: CreateSaleInput): Promise<SaleActionResponse> {
  try {
    const {
      customerId = null,
      saleDate = new Date().toISOString(),
      status = "confirmed",
      notes = null,
      deliveryFee = 0,
      discount = 0,
      items,
      initialPayment,
      delivery,
    } = payload;

    if (!items || items.length === 0) {
      return { success: false, error: "Veuillez ajouter au moins une ligne d'article à la vente." };
    }

    // Validation des lignes côté serveur
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.productId || !it.locationId) {
        return { success: false, error: `Ligne ${i + 1} : Produit et dépôt source obligatoires.` };
      }
      if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
        return { success: false, error: `Ligne ${i + 1} : La quantité doit être un nombre entier strictement positif.` };
      }
      if (typeof it.unitPrice !== "number" || it.unitPrice < 0) {
        return { success: false, error: `Ligne ${i + 1} : Le prix unitaire ne peut pas être négatif.` };
      }
    }

    // Calculs stricts des montants côté serveur
    let subtotal = 0;
    const validatedItems = items.map((it) => {
      const lineDiscount = Math.max(0, it.discount || 0);
      const lineSubtotal = Math.max(0, it.quantity * it.unitPrice - lineDiscount);
      subtotal += lineSubtotal;
      return {
        ...it,
        discount: lineDiscount,
        subtotal: lineSubtotal,
      };
    });

    const safeDeliveryFee = Math.max(0, deliveryFee || 0);
    const safeGlobalDiscount = Math.max(0, discount || 0);
    const totalAmount = Math.max(0, subtotal + safeDeliveryFee - safeGlobalDiscount);

    // Initialisation paiement
    const paymentAmount = initialPayment && initialPayment.amount > 0 ? initialPayment.amount : 0;
    if (paymentAmount > totalAmount) {
      return {
        success: false,
        error: `Le versement initial (${paymentAmount.toLocaleString("fr-DZ")} DA) ne peut pas excéder le montant total de la facture (${totalAmount.toLocaleString("fr-DZ")} DA).`,
      };
    }
    if (paymentAmount < 0) {
      return { success: false, error: "Le montant du paiement ne peut pas être négatif." };
    }

    let paymentStatus = "unpaid";
    if (paymentAmount >= totalAmount && totalAmount > 0) {
      paymentStatus = "paid";
    } else if (paymentAmount > 0) {
      paymentStatus = "partial";
    }

    const deliveryStatus = delivery?.hasDelivery ? "pending" : "none";

    // Transaction atomique
    const result = await prisma.$transaction(async (tx) => {
      // 1. Générer le numéro de facture unique (ex: FAC-202610-0001)
      const isDraft = status === "draft";
      const reference = await generateNextInvoiceNumber(tx, isDraft);

      // Récupérer le nom du client si présent
      let customerName: string | null = null;
      if (customerId) {
        const c = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true, name: true, isActive: true },
        });
        if (!c) throw new Error("Client introuvable.");
        if (!c.isActive) throw new Error(`Le client "${c.name}" est inactif. Activez-le pour lui facturer des meubles.`);
        customerName = c.name;
      }

      // 2. Créer l'enregistrement Sales
      const sale = await tx.sales.create({
        data: {
          reference,
          customerId,
          status,
          subtotal,
          discount: safeGlobalDiscount,
          deliveryFee: safeDeliveryFee,
          totalAmount,
          paidAmount: paymentAmount,
          paymentStatus,
          deliveryStatus,
          notes,
          saleDate: new Date(saleDate),
        },
      });

      // 3. Créer les lignes de vente SaleItem
      for (const item of validatedItems) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            locationId: item.locationId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            subtotal: item.subtotal,
          },
        });

        // 4. Si la vente est confirmée : déduction physique du stock et traçabilité du mouvement
        if (status === "confirmed") {
          await deductStockForSaleItem(tx, {
            saleId: sale.id,
            saleReference: sale.reference,
            productId: item.productId,
            locationId: item.locationId,
            quantity: item.quantity,
            customerName,
          });
        }
      }

      // 5. Enregistrer le paiement initial si fourni et vente confirmée
      if (status === "confirmed" && paymentAmount > 0 && initialPayment) {
        const payRef = await generateNextPaymentReference(tx);
        await tx.payment.create({
          data: {
            reference: payRef,
            saleId: sale.id,
            amount: paymentAmount,
            method: initialPayment.method || "cash",
            status: "completed",
            notes: initialPayment.notes?.trim() || `Règlement initial pour facture ${sale.reference}`,
            paymentDate: new Date(saleDate),
          },
        });
      }

      // 6. Enregistrer la livraison si demandée
      if (delivery?.hasDelivery) {
        const livRef = await generateNextDeliveryReference(tx);
        const delMethod = delivery.method || (delivery.address?.trim() ? "home_delivery" : "store_pickup");
        await tx.delivery.create({
          data: {
            reference: livRef,
            saleId: sale.id,
            status: "pending",
            method: delMethod,
            fee: delMethod === "store_pickup" ? 0 : safeDeliveryFee,
            address: delMethod === "store_pickup" ? "Retrait au magasin" : (delivery.address?.trim() || "Adresse client"),
            deliveryDate: delivery.plannedDate ? new Date(delivery.plannedDate) : null,
            recipientName: delivery.recipientName?.trim() || null,
            carrierName: delivery.carrierName?.trim() || null,
            notes: delivery.notes?.trim() || null,
          },
        });
      }

      return sale;
    });

    safeRevalidate("/sales");
    safeRevalidate("/products");
    safeRevalidate("/customers");
    safeRevalidate("/cash");

    const statusLabel = result.status === "confirmed" ? "confirmée et facturée" : "enregistrée en brouillon (devis)";
    return {
      success: true,
      message: `Vente ${result.reference} ${statusLabel} avec succès.`,
      data: result,
    };
  } catch (err: unknown) {
    console.error("Erreur création vente:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement de la vente.";
    return { success: false, error: msg };
  }
}

// ─── CONFIRMATION D'UNE VENTE BROUILLON ───────────────────────────────────────

export async function confirmDraftSaleAction(
  saleId: number,
  initialPayment?: { amount: number; method: "cash" | "cib" | "check" | "transfer"; notes?: string }
): Promise<SaleActionResponse> {
  try {
    const sale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!sale) return { success: false, error: "Vente introuvable." };
    if (sale.status === "confirmed") {
      return { success: false, error: "Cette vente a déjà été confirmée." };
    }
    if (sale.status === "cancelled") {
      return { success: false, error: "Impossible de confirmer une vente annulée." };
    }

    const paymentAmount = initialPayment && initialPayment.amount > 0 ? initialPayment.amount : 0;
    if (paymentAmount > sale.totalAmount) {
      return { success: false, error: "Le montant du paiement dépasse le total de la facture." };
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Déduire le stock pour chaque article
      for (const item of sale.items) {
        if (!item.locationId) {
          throw new Error(`L'article ${item.productId} n'a pas de dépôt source spécifié.`);
        }
        await deductStockForSaleItem(tx, {
          saleId: sale.id,
          saleReference: sale.reference,
          productId: item.productId,
          locationId: item.locationId,
          quantity: item.quantity,
          customerName: sale.customer?.name,
        });
      }

      // 2. Si c'était une référence brouillon DEV-, générer un vrai numéro de facture FAC-
      let reference = sale.reference;
      if (reference.startsWith("DEV-")) {
        reference = await generateNextInvoiceNumber(tx, false);
      }

      let paymentStatus = sale.paymentStatus;
      let newPaid = sale.paidAmount;

      if (paymentAmount > 0 && initialPayment) {
        const payRef = await generateNextPaymentReference(tx);
        await tx.payment.create({
          data: {
            reference: payRef,
            saleId: sale.id,
            amount: paymentAmount,
            method: initialPayment.method || "cash",
            status: "completed",
            notes: initialPayment.notes?.trim() || `Paiement à la confirmation de facture ${reference}`,
          },
        });
        newPaid += paymentAmount;
        paymentStatus = newPaid >= sale.totalAmount ? "paid" : "partial";
      }

      // 3. Mettre à jour la vente
      const updated = await tx.sales.update({
        where: { id: sale.id },
        data: {
          reference,
          status: "confirmed",
          paidAmount: newPaid,
          paymentStatus,
        },
      });

      return updated;
    });

    safeRevalidate("/sales");
    safeRevalidate("/products");
    safeRevalidate("/customers");

    return {
      success: true,
      message: `Vente ${result.reference} confirmée avec succès. Le stock a été déduit.`,
      data: result,
    };
  } catch (err: unknown) {
    console.error("Erreur confirmation vente:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la confirmation de la vente.";
    return { success: false, error: msg };
  }
}

// ─── ANNULATION D'UNE VENTE CONFIRMÉE (AVEC RÉINTÉGRATION DU STOCK) ───────────

export async function cancelSaleAction(saleId: number, reason: string): Promise<SaleActionResponse> {
  try {
    const trimmedReason = reason?.trim();
    if (!trimmedReason || trimmedReason.length < 3) {
      return { success: false, error: "Le motif d'annulation est obligatoire (au moins 3 caractères)." };
    }

    const sale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    });

    if (!sale) return { success: false, error: "Vente introuvable." };
    if (sale.status === "cancelled") {
      return { success: false, error: "Cette vente est déjà annulée." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Si la vente était confirmée, réintégrer le stock
      if (sale.status === "confirmed") {
        await restoreStockForCancelledSale(tx, {
          saleId: sale.id,
          saleReference: sale.reference,
          reason: trimmedReason,
        });
      }

      // 2. Marquer les paiements comme annulés
      await tx.payment.updateMany({
        where: { saleId: sale.id },
        data: { status: "cancelled", notes: `Annulé : ${trimmedReason}` },
      });

      // 3. Mettre à jour le statut de la vente
      await tx.sales.update({
        where: { id: sale.id },
        data: {
          status: "cancelled",
          notes: sale.notes
            ? `${sale.notes}\n[Annulé le ${new Date().toLocaleDateString("fr-DZ")} : ${trimmedReason}]`
            : `[Annulé le ${new Date().toLocaleDateString("fr-DZ")} : ${trimmedReason}]`,
        },
      });
    });

    safeRevalidate("/sales");
    safeRevalidate("/products");
    safeRevalidate("/customers");

    return {
      success: true,
      message: `La vente ${sale.reference} a été annulée. Les stocks ont été réintégrés et les mouvements compensatoires enregistrés.`,
    };
  } catch (err: unknown) {
    console.error("Erreur annulation vente:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'annulation de la vente.";
    return { success: false, error: msg };
  }
}

// ─── ENREGISTREMENT D'UN PAIEMENT COMPLÉMENTAIRE SUR FACTURE ─────────────────

export async function recordSalePaymentAction(formData: FormData): Promise<SaleActionResponse> {
  try {
    const saleIdStr = formData.get("saleId") as string;
    const amountStr = formData.get("amount") as string;
    const method = (formData.get("method") as string) || "cash";
    const notes = (formData.get("notes") as string)?.trim() || null;
    const paymentDateStr = formData.get("paymentDate") as string;

    if (!saleIdStr || !amountStr) {
      return { success: false, error: "La facture et le montant du règlement sont obligatoires." };
    }

    const saleId = parseInt(saleIdStr, 10);
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant du règlement doit être un nombre strictement supérieur à 0 DA." };
    }

    const sale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: { customer: true },
    });

    if (!sale) return { success: false, error: "Facture introuvable." };
    if (sale.status !== "confirmed") {
      return { success: false, error: "Les règlements ne peuvent être enregistrés que sur des ventes confirmées." };
    }

    const remainingBalance = Math.max(0, sale.totalAmount - sale.paidAmount);
    if (amount > remainingBalance) {
      return {
        success: false,
        error: `Le montant versé (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA). Les trop-perçus ne sont pas autorisés.`,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const payRef = await generateNextPaymentReference(tx);
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();

      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          saleId: sale.id,
          amount,
          method,
          status: "completed",
          notes: notes || `Règlement sur facture ${sale.reference}`,
          paymentDate,
        },
      });

      const newPaid = sale.paidAmount + amount;
      const newPaymentStatus = newPaid >= sale.totalAmount ? "paid" : "partial";

      await tx.sales.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: newPaymentStatus,
        },
      });

      return { payment, newPaid, newPaymentStatus };
    });

    safeRevalidate("/sales");
    safeRevalidate("/customers");
    safeRevalidate("/cash");

    const newBalance = Math.max(0, sale.totalAmount - result.newPaid);
    return {
      success: true,
      message: `Versement de ${amount.toLocaleString("fr-DZ")} DA validé (Réf: ${result.payment.reference}). Nouveau reste à payer : ${newBalance.toLocaleString("fr-DZ")} DA.`,
      data: result.payment,
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement règlement:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de l'enregistrement du règlement.";
    return { success: false, error: msg };
  }
}

// ─── MISE À JOUR DU STATUT DE LIVRAISON ──────────────────────────────────────

export async function updateDeliveryStatusAction(
  deliveryId: number,
  newStatus: string,
  notes?: string,
  extra?: { carrierName?: string; recipientName?: string; deliveredAt?: string }
): Promise<SaleActionResponse> {
  try {
    const validStatuses = [
      "to_prepare",
      "ready",
      "in_transit",
      "delivered",
      "postponed",
      "cancelled",
      "pending",
    ];
    if (!validStatuses.includes(newStatus)) {
      return { success: false, error: "Statut de livraison non valide." };
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) return { success: false, error: "Fiche livraison introuvable." };

    const isDelivered = newStatus === "delivered";
    const deliveredAtValue = isDelivered
      ? extra?.deliveredAt
        ? new Date(extra.deliveredAt)
        : delivery.deliveredAt || new Date()
      : delivery.deliveredAt;

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: newStatus,
          notes: notes?.trim() || delivery.notes,
          carrierName: extra?.carrierName !== undefined ? extra.carrierName.trim() || null : delivery.carrierName,
          recipientName: extra?.recipientName !== undefined ? extra.recipientName.trim() || null : delivery.recipientName,
          deliveredAt: deliveredAtValue,
        },
      });

      if (delivery.saleId) {
        await tx.sales.update({
          where: { id: delivery.saleId },
          data: { deliveryStatus: newStatus },
        });
      }
    });

    safeRevalidate("/sales");
    safeRevalidate("/deliveries");
    safeRevalidate("/documents");

    return {
      success: true,
      message: `Statut de livraison mis à jour : ${newStatus}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur statut livraison:", err);
    return { success: false, error: "Erreur lors de la mise à jour de la livraison." };
  }
}
