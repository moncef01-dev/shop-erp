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
import { assertPeriodNotLocked, assertDatesNotLocked } from "@/lib/period-lock";

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
          include: {
            session: {
              select: { id: true, reference: true, status: true },
            },
          },
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

    await assertDatesNotLocked([saleDate, new Date()], "Création de vente");

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
        } else if (payMethod === "transfer" || payMethod === "check" || payMethod === "cib") {
          const bankAcc = await tx.treasuryAccount.findFirst({
            where: { code: "ACC-BANQUE", isActive: true },
            select: { id: true },
          });
          if (bankAcc) {
            accountId = bankAcc.id;
          }
        }

        const payRef = await generateNextPaymentReference(tx);
        const parsedPaymentDate = new Date(saleDate);
        const now = new Date();
        const effectivePaymentDate =
          parsedPaymentDate.toDateString() === now.toDateString() ||
          (parsedPaymentDate.getHours() === 0 && parsedPaymentDate.getMinutes() === 0)
            ? now
            : parsedPaymentDate;

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
    await assertDatesNotLocked([sale.saleDate, new Date()], "Confirmation de vente");
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

    const result = await prisma.$transaction(
      async (tx) => {
        // Pré-chargement optimisé des produits et emplacements pour éliminer les requêtes répétées
        const uniqueProductIds = Array.from(new Set(sale.items.map((i) => i.productId)));
        const uniqueLocationIds = Array.from(
          new Set(sale.items.filter((i) => i.locationId).map((i) => i.locationId!))
        );

        const [productsList, locationsList] = await Promise.all([
          tx.product.findMany({
            where: { id: { in: uniqueProductIds } },
            select: { id: true, name: true, sku: true, costPrice: true, isActive: true },
          }),
          tx.location.findMany({
            where: { id: { in: uniqueLocationIds } },
            select: { id: true, name: true, code: true, isActive: true },
          }),
        ]);

        const productCache = new Map(productsList.map((p) => [p.id, p]));
        const locationCache = new Map(locationsList.map((l) => [l.id, l]));

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
            productCache,
            locationCache,
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
          } else if (payMethod === "transfer" || payMethod === "check" || payMethod === "cib") {
            const bankAcc = await tx.treasuryAccount.findFirst({
              where: { code: "ACC-BANQUE", isActive: true },
              select: { id: true },
            });
            if (bankAcc) {
              accountId = bankAcc.id;
            }
          }

          const payRef = await generateNextPaymentReference(tx);
          await tx.payment.create({
            data: {
              reference: payRef,
              saleId: sale.id,
              accountId,
              amount: paymentAmount,
              method: payMethod,
              status: "completed",
              notes: initialPayment.notes?.trim() || `Paiement à la confirmation de facture ${reference}`,
              paymentDate: new Date(),
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
      },
      { maxWait: 10000, timeout: 20000 }
    );

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

// ─── MODIFICATION / RÉOUVERTURE D'UNE VENTE OU FACTURE ───────────────────────

export interface UpdateSaleInput {
  saleId: number;
  customerId?: number | null;
  saleDate?: string;
  notes?: string | null;
  editReason?: string;
  deliveryFee?: number;
  includeDeliveryFee?: boolean;
  discount?: number;
  items: SaleItemInput[];
  revisedPaidAmount?: number;
  additionalPaymentMethod?: "cash" | "cib" | "check" | "transfer";
  additionalPaymentNotes?: string;
  additionalPayment?: {
    amount: number;
    method: "cash" | "cib" | "check" | "transfer";
    notes?: string;
  };
}

export async function updateSaleAction(payload: UpdateSaleInput): Promise<SaleActionResponse> {
  try {
    const {
      saleId,
      customerId = null,
      saleDate,
      notes = null,
      editReason = "",
      deliveryFee = 0,
      includeDeliveryFee,
      discount = 0,
      items,
      revisedPaidAmount,
      additionalPaymentMethod,
      additionalPaymentNotes,
      additionalPayment,
    } = payload;

    if (!saleId || typeof saleId !== "number") {
      return { success: false, error: "Identifiant de facture invalide." };
    }

    if (!items || items.length === 0) {
      return { success: false, error: "Veuillez conserver au moins une ligne d'article dans la facture." };
    }

    // 1. Validation stricte des lignes
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

    // 2. Calculs des montants côté serveur
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
    const shouldIncludeDeliveryFee =
      includeDeliveryFee !== undefined ? Boolean(includeDeliveryFee) : parsedDeliveryFee > 0;
    const effectiveDeliveryFee = shouldIncludeDeliveryFee ? parsedDeliveryFee : 0;
    const safeGlobalDiscount = roundMoney(Math.max(0, discount || 0));
    const newTotalAmount = roundMoney(Math.max(0, subtotal + effectiveDeliveryFee - safeGlobalDiscount));

    const result = await prisma.$transaction(async (tx) => {
      // 3. Charger la vente existante avec ses lignes, paiements et allocations
      const existingSale = await tx.sales.findUnique({
        where: { id: saleId },
        include: {
          customer: true,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, costPrice: true } },
              location: { select: { id: true, name: true } },
            },
          },
          payments: {
            where: { status: { not: "cancelled" } },
            include: {
              session: {
                select: { id: true, reference: true, status: true },
              },
            },
            orderBy: { paymentDate: "desc" },
          },
          advanceAllocations: true,
        },
      });

      if (!existingSale) {
        throw new Error("Facture introuvable.");
      }
      await assertDatesNotLocked(
        [
          existingSale.saleDate,
          saleDate ? new Date(saleDate) : null,
          ...existingSale.payments.map((p) => p.paymentDate),
          new Date(),
        ],
        "Modification de facture",
        tx
      );
      if (existingSale.status === "cancelled") {
        throw new Error("Impossible de modifier une facture ou vente annulée.");
      }

      // Valider le client si modifié
      if (customerId && customerId !== existingSale.customerId) {
        const c = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true, name: true },
        });
        if (!c) throw new Error("Client sélectionné introuvable.");
      }

      // 4. Réconciliation fine des stocks si la vente est confirmée
      if (existingSale.status === "confirmed") {
        const oldStockMap = new Map<string, { productId: number; locationId: number; qty: number }>();
        for (const it of existingSale.items) {
          if (!it.locationId) continue;
          const key = `${it.productId}_${it.locationId}`;
          const current = oldStockMap.get(key) || {
            productId: it.productId,
            locationId: it.locationId,
            qty: 0,
          };
          current.qty += it.quantity;
          oldStockMap.set(key, current);
        }

        const newStockMap = new Map<string, { productId: number; locationId: number; qty: number }>();
        for (const it of validatedItems) {
          const key = `${it.productId}_${it.locationId}`;
          const current = newStockMap.get(key) || {
            productId: it.productId,
            locationId: it.locationId,
            qty: 0,
          };
          current.qty += it.quantity;
          newStockMap.set(key, current);
        }

        const allStockKeys = new Set([...oldStockMap.keys(), ...newStockMap.keys()]);

        // Optimisation : pré-chargement en lot des produits, emplacements et stocks pour éliminer les requêtes répétées
        const uniqueProductIds = Array.from(
          new Set(Array.from(allStockKeys).map((k) => (oldStockMap.get(k) || newStockMap.get(k))!.productId))
        );
        const uniqueLocationIds = Array.from(
          new Set(Array.from(allStockKeys).map((k) => (oldStockMap.get(k) || newStockMap.get(k))!.locationId))
        );

        const [productsList, locationsList, stockRecordsList] = await Promise.all([
          tx.product.findMany({
            where: { id: { in: uniqueProductIds } },
            select: { id: true, name: true, sku: true, costPrice: true, isActive: true },
          }),
          tx.location.findMany({
            where: { id: { in: uniqueLocationIds } },
            select: { id: true, name: true, code: true, isActive: true },
          }),
          tx.productStock.findMany({
            where: {
              productId: { in: uniqueProductIds },
              locationId: { in: uniqueLocationIds },
            },
          }),
        ]);

        const productCache = new Map(productsList.map((p) => [p.id, p]));
        const locationCache = new Map(locationsList.map((l) => [l.id, l]));
        const stockCache = new Map(stockRecordsList.map((s) => [`${s.productId}_${s.locationId}`, s.quantity]));

        for (const key of allStockKeys) {
          const oldEntry = oldStockMap.get(key);
          const newEntry = newStockMap.get(key);

          const productId = oldEntry?.productId ?? newEntry!.productId;
          const locationId = oldEntry?.locationId ?? newEntry!.locationId;
          const oldQty = oldEntry?.qty ?? 0;
          const newQty = newEntry?.qty ?? 0;
          const delta = newQty - oldQty; // positif = prélèvement supplémentaire, négatif = réintégration

          if (delta === 0) continue;

          const product = productCache.get(productId);
          if (!product) throw new Error(`Produit introuvable (ID: ${productId}).`);

          const location = locationCache.get(locationId);
          if (!location) throw new Error(`Emplacement introuvable (ID: ${locationId}).`);

          const availableStock = stockCache.get(key) ?? 0;

          if (delta > 0) {
            // Prélèvement supplémentaire
            if (!product.isActive) {
              throw new Error(`Le produit "${product.name}" (${product.sku}) est inactif.`);
            }
            if (!location.isActive) {
              throw new Error(`L'emplacement "${location.name}" est inactif.`);
            }
            if (availableStock < delta) {
              throw new Error(
                `Stock disponible insuffisant pour "${product.name}" au dépôt "${location.name}". ` +
                `Disponible : ${availableStock} unité(s), augmentation demandée : +${delta} unité(s).`
              );
            }

            const stockBefore = availableStock;
            const stockAfter = availableStock - delta;

            await tx.productStock.update({
              where: { productId_locationId: { productId, locationId } },
              data: { quantity: stockAfter },
            });

            const allStocks = await tx.productStock.findMany({
              where: { productId },
              select: { quantity: true },
            });
            const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);
            await tx.product.update({
              where: { id: productId },
              data: { stock: newTotal },
            });

            await tx.stockMovement.create({
              data: {
                reference: `MVT-MOD-${existingSale.reference}-${product.sku}`,
                type: "SALE",
                productId,
                fromLocationId: locationId,
                toLocationId: null,
                quantity: delta,
                unitCost: product.costPrice,
                stockBefore,
                stockAfter,
                reason: `Ajustement modification vente ${existingSale.reference}`,
                notes: `Facture N° ${existingSale.reference} modifiée (augmentation quantité: +${delta})`,
                saleId: existingSale.id,
              },
            });
          } else {
            // delta < 0 : Réintégration de stock (annulation partielle / retour)
            const restoreQty = Math.abs(delta);
            const stockBefore = availableStock;
            const stockAfter = availableStock + restoreQty;

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

            const allStocks = await tx.productStock.findMany({
              where: { productId },
              select: { quantity: true },
            });
            const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);
            await tx.product.update({
              where: { id: productId },
              data: { stock: newTotal },
            });

            await tx.stockMovement.create({
              data: {
                reference: `RET-MOD-${existingSale.reference}-${product.sku}`,
                type: "RECEIPT",
                productId,
                fromLocationId: null,
                toLocationId: locationId,
                quantity: restoreQty,
                unitCost: product.costPrice,
                stockBefore,
                stockAfter,
                reason: `Réintégration modification vente ${existingSale.reference}`,
                notes: `Facture N° ${existingSale.reference} modifiée (réduction quantité: -${restoreQty})`,
                saleId: existingSale.id,
              },
            });
          }
        }
      }

      // 5. Remplacement des lignes de vente
      await tx.saleItem.deleteMany({
        where: { saleId },
      });

      for (const item of validatedItems) {
        await tx.saleItem.create({
          data: {
            saleId: existingSale.id,
            productId: item.productId,
            locationId: item.locationId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            subtotal: item.subtotal,
          },
        });
      }

      // 6. Gestion financière des paiements existants & éventuelle révision du montant encaissé
      const realPayments = existingSale.payments;
      const realPaymentsSum = realPayments.reduce((sum, p) => sum + p.amount, 0);
      const advanceAllocationsSum = existingSale.advanceAllocations.reduce((sum, a) => sum + a.amount, 0);
      const originalTotalPaid = roundMoney(realPaymentsSum + advanceAllocationsSum);

      let targetPaidAmount = originalTotalPaid;
      if (revisedPaidAmount !== undefined) {
        if (typeof revisedPaidAmount !== "number" || isNaN(revisedPaidAmount) || revisedPaidAmount < 0) {
          throw new Error("Le montant déjà encaissé doit être un nombre positif ou nul.");
        }
        targetPaidAmount = roundMoney(revisedPaidAmount);
      }

      if (additionalPayment && additionalPayment.amount > 0) {
        targetPaidAmount = roundMoney(targetPaidAmount + additionalPayment.amount);
      }

      const deltaPaid = roundMoney(targetPaidAmount - originalTotalPaid);
      let totalPaid = originalTotalPaid;
      const paymentAuditEntries: string[] = [];

      if (deltaPaid < 0) {
        // Scénario A & D : Correction à la baisse d'un encaissement saisi par erreur
        const toReduce = roundMoney(Math.abs(deltaPaid));

        // Identifier les règlements rattachés à une session de caisse clôturée
        const closedPayments = realPayments.filter(
          (p) => p.session && p.session.status === "closed"
        );
        const openPayments = realPayments.filter(
          (p) => !p.session || p.session.status !== "closed"
        );

        const openPaymentsSum = roundMoney(openPayments.reduce((sum, p) => sum + p.amount, 0));

        // Si le montant à réduire dépasse ce qui peut être absorbé par les paiements ouverts / non clôturés
        if (toReduce > openPaymentsSum) {
          const closedDesc = closedPayments
            .map(
              (p) =>
                `${p.reference || "Paiement"} de ${p.amount.toLocaleString("fr-DZ")} DA (Session ${
                  p.session?.reference || "clôturée"
                })`
            )
            .join(", ");

          throw new Error(
            `Impossible de réduire le montant déjà encaissé de ${toReduce.toLocaleString("fr-DZ")} DA : ` +
              (closedPayments.length > 0
                ? `les règlements correspondants [${closedDesc}] appartiennent à une session de caisse clôturée dont l'arrêté comptable est définitivement scellé. `
                : `le montant à déduire excède le total des règlements directs modifiables (${openPaymentsSum.toLocaleString("fr-DZ")} DA). `) +
              `Pour régulariser une erreur de caisse historique sans fausser les arrêtés passés, enregistrez une opération de régularisation explicite dans le module Caisse / Trésorerie.`
          );
        }

        // Réduire depuis les paiements ouverts (du plus récent au plus ancien)
        let remainingToReduce = toReduce;
        for (const p of openPayments) {
          if (remainingToReduce <= 0) break;
          const deduct = roundMoney(Math.min(p.amount, remainingToReduce));
          const newAmount = roundMoney(p.amount - deduct);
          remainingToReduce = roundMoney(remainingToReduce - deduct);

          const nowTimeStr = new Date().toLocaleDateString("fr-DZ") + " à " + new Date().toLocaleTimeString("fr-DZ");
          const auditText = `[Rectification le ${nowTimeStr} : Montant ajusté de ${p.amount.toLocaleString("fr-DZ")} DA à ${newAmount.toLocaleString("fr-DZ")} DA. Motif : ${editReason?.trim() || "Correction d'encaissement sur facture"}]`;

          if (newAmount > 0) {
            await tx.payment.update({
              where: { id: p.id },
              data: {
                amount: newAmount,
                notes: p.notes ? `${p.notes}\n${auditText}` : auditText,
              },
            });
          } else {
            await tx.payment.update({
              where: { id: p.id },
              data: {
                amount: 0,
                status: "cancelled",
                notes: p.notes ? `${p.notes}\n${auditText}` : auditText,
              },
            });
          }

          paymentAuditEntries.push(
            `Règlement ${p.reference || "N°" + p.id} rectifié : ${p.amount.toLocaleString("fr-DZ")} DA → ${newAmount.toLocaleString("fr-DZ")} DA`
          );
        }

        totalPaid = roundMoney(originalTotalPaid - toReduce);
      } else if (deltaPaid > 0) {
        // Scénario C : Enregistrement d'un versement réel additionnel
        const addAmount = deltaPaid;
        let sessionId: number | null = null;
        let accountId: number | null = null;
        const payMethod = additionalPaymentMethod || additionalPayment?.method || "cash";

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
        } else if (payMethod === "transfer" || payMethod === "check" || payMethod === "cib") {
          const bankAcc = await tx.treasuryAccount.findFirst({
            where: { code: "ACC-BANQUE", isActive: true },
            select: { id: true },
          });
          if (bankAcc) {
            accountId = bankAcc.id;
          }
        }

        const payRef = await generateNextPaymentReference(tx);
        const payNotes =
          additionalPaymentNotes?.trim() ||
          additionalPayment?.notes?.trim() ||
          editReason?.trim() ||
          `Encaissement lors de la modification de facture ${existingSale.reference}`;

        await tx.payment.create({
          data: {
            reference: payRef,
            saleId: existingSale.id,
            accountId,
            amount: addAmount,
            method: payMethod,
            status: "completed",
            notes: payNotes,
            paymentDate: new Date(),
            sessionId,
          },
        });

        paymentAuditEntries.push(
          `Nouveau règlement ${payRef} enregistré : +${addAmount.toLocaleString("fr-DZ")} DA (${payMethod})`
        );

        totalPaid = roundMoney(originalTotalPaid + addAmount);
      }

      let paymentStatus = "unpaid";
      if (totalPaid >= newTotalAmount && newTotalAmount > 0) {
        paymentStatus = "paid";
      } else if (totalPaid > 0) {
        paymentStatus = "partial";
      }

      // 7. Construire la trace d'audit détaillée dans les notes
      const nowStr = new Date().toLocaleDateString("fr-DZ") + " à " + new Date().toLocaleTimeString("fr-DZ");
      const reasonLabel = editReason?.trim() ? ` — Motif: ${editReason.trim()}` : "";
      const priceChangeLabel =
        newTotalAmount !== existingSale.totalAmount
          ? ` (Total: ${existingSale.totalAmount.toLocaleString("fr-DZ")} DA → ${newTotalAmount.toLocaleString("fr-DZ")} DA)`
          : "";
      const paymentChangeLabel =
        totalPaid !== originalTotalPaid
          ? ` (Encaissé: ${originalTotalPaid.toLocaleString("fr-DZ")} DA → ${totalPaid.toLocaleString("fr-DZ")} DA)`
          : "";
      const paymentDetailsLabel =
        paymentAuditEntries.length > 0 ? ` [${paymentAuditEntries.join("; ")}]` : "";

      const auditTrailEntry = `[Modifiée le ${nowStr}${reasonLabel}${priceChangeLabel}${paymentChangeLabel}${paymentDetailsLabel}]`;

      const updatedNotes = existingSale.notes
        ? `${existingSale.notes}\n${auditTrailEntry}`
        : auditTrailEntry;

      const updatedSale = await tx.sales.update({
        where: { id: existingSale.id },
        data: {
          customerId,
          subtotal,
          discount: safeGlobalDiscount,
          deliveryFee: parsedDeliveryFee,
          includeDeliveryFee: shouldIncludeDeliveryFee,
          totalAmount: newTotalAmount,
          paidAmount: totalPaid,
          paymentStatus,
          notes: notes ? `${notes}\n${auditTrailEntry}` : updatedNotes,
          saleDate: saleDate ? new Date(saleDate) : existingSale.saleDate,
        },
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

      return {
        updatedSale,
        oldTotal: existingSale.totalAmount,
        newTotal: newTotalAmount,
        totalPaid,
      };
    },
    { maxWait: 10000, timeout: 20000 }
  );

    safeRevalidate("/sales");
    safeRevalidate("/products");
    safeRevalidate("/customers");
    safeRevalidate("/cash");

    const overpayment = roundMoney(Math.max(0, result.totalPaid - result.newTotal));
    let message = `Facture ${result.updatedSale.reference} modifiée avec succès.`;
    if (overpayment > 0) {
      message += ` Attention : un trop-perçu client de ${overpayment.toLocaleString("fr-DZ")} DA est constaté (Déjà encaissé : ${result.totalPaid.toLocaleString("fr-DZ")} DA > Nouveau montant : ${result.newTotal.toLocaleString("fr-DZ")} DA). Les encaissements réels sont préservés.`;
    }

    return {
      success: true,
      message,
      data: result.updatedSale,
    };
  } catch (err: unknown) {
    console.error("Erreur modification vente:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la modification de la facture.";
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
    await assertDatesNotLocked(
      [sale.saleDate, ...sale.payments.map((p) => p.paymentDate), new Date()],
      "Annulation de vente"
    );
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

    const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
    await assertPeriodNotLocked(paymentDate, "Règlement de facture");

    const remainingBalance = roundMoney(Math.max(0, sale.totalAmount - sale.paidAmount));
    if (amount > remainingBalance) {
      return {
        success: false,
        error: `Le montant versé (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA). Les trop-perçus ne sont pas autorisés.`,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const currentSale = await tx.sales.findUnique({
        where: { id: saleId },
        select: { id: true, reference: true, totalAmount: true, paidAmount: true, status: true },
      });

      if (!currentSale) throw new Error("Facture introuvable.");
      if (currentSale.status === "cancelled") {
        throw new Error("Impossible d'enregistrer un règlement sur une vente ou commande annulée.");
      }

      const remainingBalance = roundMoney(Math.max(0, currentSale.totalAmount - currentSale.paidAmount));
      if (amount > remainingBalance) {
        throw new Error(
          `Le montant versé (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA). Les trop-perçus ne sont pas autorisés.`
        );
      }

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
      } else if (method === "transfer" || method === "check" || method === "cib") {
        const bankAcc = await tx.treasuryAccount.findFirst({
          where: { code: "ACC-BANQUE", isActive: true },
          select: { id: true },
        });
        if (bankAcc) {
          accountId = bankAcc.id;
        }
      }

      const payRef = await generateNextPaymentReference(tx);
      const parsedPaymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
      const now = new Date();
      const effectivePaymentDate =
        parsedPaymentDate.toDateString() === now.toDateString() ||
        (parsedPaymentDate.getHours() === 0 && parsedPaymentDate.getMinutes() === 0)
          ? now
          : parsedPaymentDate;

      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          saleId: currentSale.id,
          accountId,
          amount,
          method,
          status: "completed",
          notes: notes || `Règlement sur commande/facture ${currentSale.reference}`,
          paymentDate: effectivePaymentDate,
          sessionId,
        },
      });

      const newPaid = roundMoney(currentSale.paidAmount + amount);
      const newPaymentStatus = newPaid >= currentSale.totalAmount ? "paid" : "partial";

      await tx.sales.update({
        where: { id: currentSale.id },
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


