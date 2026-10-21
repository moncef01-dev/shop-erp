"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  deductStockForSaleItem,
  restoreStockForCancelledSale,
  type PrismaTransactionClient,
} from "@/lib/inventory-transaction";
import { roundMoney } from "@/lib/formatters";
import { getCustomerAdvancesData } from "./advances-actions";

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
        movements: true,
      },
      orderBy: { saleDate: "desc" },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
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
  const activeSales = sales.filter((s) => s.status !== "cancelled");
  const confirmedSales = sales.filter((s) => s.status === "confirmed");
  const totalRevenue = roundMoney(confirmedSales.reduce((acc, s) => acc + s.totalAmount, 0));
  const totalCollected = roundMoney(activeSales.reduce((acc, s) => acc + s.paidAmount, 0));
  const totalOutstandingCredit = roundMoney(
    activeSales.reduce((acc, s) => acc + Math.max(0, s.totalAmount - s.paidAmount), 0)
  );
  const [settings, activeSession, advances] = await Promise.all([
    prisma.shopSettings.findUnique({ where: { id: 1 } }),
    prisma.cashSession.findFirst({
      where: { status: "open" },
      select: { id: true, reference: true },
    }),
    getCustomerAdvancesData(),
  ]);

  return {
    sales,
    customers,
    products,
    locations,
    settings,
    advances,
    activeCashSession: activeSession ? { id: activeSession.id, reference: activeSession.reference } : null,
    metrics: {
      totalRevenue,
      totalCollected,
      totalOutstandingCredit,
      totalSalesCount: confirmedSales.length,
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
  includeDeliveryFee?: boolean;
  discount?: number;
  items: SaleItemInput[];
  initialPayment?: {
    amount: number;
    method: "cash" | "cib" | "check" | "transfer";
    notes?: string;
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
      includeDeliveryFee,
      discount = 0,
      items,
      initialPayment,
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
      const lineDiscount = roundMoney(Math.max(0, it.discount || 0));
      const lineSubtotal = roundMoney(Math.max(0, it.quantity * it.unitPrice - lineDiscount));
      subtotal = roundMoney(subtotal + lineSubtotal);
      return {
        ...it,
        discount: lineDiscount,
        subtotal: lineSubtotal,
      };
    });

    const parsedDeliveryFee = roundMoney(Math.max(0, deliveryFee || 0));
    // Si includeDeliveryFee est explicitement fourni, on l'utilise ; sinon si deliveryFee > 0, compatibilité descendante
    const shouldIncludeDeliveryFee =
      includeDeliveryFee !== undefined ? Boolean(includeDeliveryFee) : parsedDeliveryFee > 0;
    const effectiveDeliveryFee = shouldIncludeDeliveryFee ? parsedDeliveryFee : 0;
    const safeGlobalDiscount = roundMoney(Math.max(0, discount || 0));
    const totalAmount = roundMoney(Math.max(0, subtotal + effectiveDeliveryFee - safeGlobalDiscount));

    // Initialisation paiement
    const paymentAmount = initialPayment && initialPayment.amount > 0 ? roundMoney(initialPayment.amount) : 0;
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

    const deliveryStatus = "none";

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
          select: { id: true, name: true },
        });
        if (!c) throw new Error("Client introuvable.");
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
          deliveryFee: parsedDeliveryFee,
          includeDeliveryFee: shouldIncludeDeliveryFee,
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

      // 5. Enregistrer le paiement initial / acompte si fourni (valable sur vente confirmée ou commande/devis)
      if (paymentAmount > 0 && initialPayment) {
        let sessionId: number | null = null;
        let accountId: number | null = null;
        const payMethod = initialPayment.method || "cash";
        if (payMethod === "cash") {
          const activeSession = await tx.cashSession.findFirst({
            where: { status: "open" },
            select: { id: true },
          });
          if (activeSession) {
            sessionId = activeSession.id;
          }
          const defaultCaisse = await tx.treasuryAccount.findFirst({
            where: { isDefault: true, isActive: true },
            select: { id: true },
          });
          if (defaultCaisse) {
            accountId = defaultCaisse.id;
          }
        }

        const payRef = await generateNextPaymentReference(tx);
        const parsedPaymentDate = new Date(saleDate);
        const now = new Date();
        const effectivePaymentDate =
          parsedPaymentDate.toDateString() === now.toDateString() ? now : parsedPaymentDate;

        await tx.payment.create({
          data: {
            reference: payRef,
            saleId: sale.id,
            accountId,
            amount: paymentAmount,
            method: payMethod,
            status: "completed",
            notes:
              initialPayment.notes?.trim() ||
              (isDraft
                ? `Acompte initial sur commande ${sale.reference}`
                : `Règlement initial pour facture ${sale.reference}`),
            paymentDate: effectivePaymentDate,
            sessionId,
          },
        });
      }



      const fullSale = await tx.sales.findUnique({
        where: { id: sale.id },
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
        },
      });

      return fullSale || sale;
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

    const remainingBalance = roundMoney(Math.max(0, sale.totalAmount - sale.paidAmount));
    const paymentAmount = initialPayment && initialPayment.amount > 0 ? roundMoney(initialPayment.amount) : 0;
    if (paymentAmount > remainingBalance) {
      return {
        success: false,
        error: `Le montant du versement (${paymentAmount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA).`,
      };
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
        let sessionId: number | null = null;
        const payMethod = initialPayment.method || "cash";
        if (payMethod === "cash") {
          const activeSession = await tx.cashSession.findFirst({
            where: { status: "open" },
            select: { id: true },
          });
          if (activeSession) {
            sessionId = activeSession.id;
          }
        }

        const payRef = await generateNextPaymentReference(tx);
        await tx.payment.create({
          data: {
            reference: payRef,
            saleId: sale.id,
            amount: paymentAmount,
            method: payMethod,
            status: "completed",
            notes: initialPayment.notes?.trim() || `Paiement à la confirmation de facture ${reference}`,
            sessionId,
          },
        });
        newPaid = roundMoney(newPaid + paymentAmount);
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

      const fullSale = await tx.sales.findUnique({
        where: { id: sale.id },
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
        },
      });

      return fullSale || updated;
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
    const amount = roundMoney(parseFloat(amountStr));

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant du règlement doit être un nombre strictement supérieur à 0 DA." };
    }

    const sale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: { customer: true },
    });

    if (!sale) return { success: false, error: "Facture introuvable." };
    if (sale.status === "cancelled") {
      return { success: false, error: "Impossible d'enregistrer un règlement sur une vente ou commande annulée." };
    }

    const remainingBalance = roundMoney(Math.max(0, sale.totalAmount - sale.paidAmount));
    if (amount > remainingBalance) {
      return {
        success: false,
        error: `Le montant versé (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA). Les trop-perçus ne sont pas autorisés.`,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      let sessionId: number | null = null;
      let accountId: number | null = null;
      if (method === "cash") {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: "open" },
          select: { id: true },
        });
        if (activeSession) {
          sessionId = activeSession.id;
        }
        const defaultCaisse = await tx.treasuryAccount.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        });
        if (defaultCaisse) {
          accountId = defaultCaisse.id;
        }
      }

      const payRef = await generateNextPaymentReference(tx);
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();

      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          saleId: sale.id,
          accountId,
          amount,
          method,
          status: "completed",
          notes: notes || `Règlement sur commande/facture ${sale.reference}`,
          paymentDate,
          sessionId,
        },
      });

      const newPaid = roundMoney(sale.paidAmount + amount);
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

export async function getSaleForPrintAction(saleId: number): Promise<SaleActionResponse> {
  try {
    const sale = await prisma.sales.findUnique({
      where: { id: saleId },
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
      },
    });

    if (!sale) return { success: false, error: "Vente introuvable." };
    return { success: true, data: sale };
  } catch (err: unknown) {
    console.error("Erreur chargement vente pour impression:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors du chargement de la vente.";
    return { success: false, error: msg };
  }
}


