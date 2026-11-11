"use server";

import { prisma } from "@/server/db";
import { revalidatePath } from "next/cache";
import type { TxClient } from "@/server/db";
import { assertPeriodNotLocked } from "@/server/services/period-lock";
import { calculateSupplierDebt } from "@/server/repositories/suppliers.repository";
import { getSupplierAdditionalPaymentTotal } from "./additional-payment-actions";

export type AllocationActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate() {
  try {
    revalidatePath("/suppliers");
    revalidatePath("/purchases");
  } catch {
    // Ignore in tests / non-Next context
  }
}

// ─── GÉNÉRATION DE RÉFÉRENCE D'IMPUTATION ────────────────────────────────────

export async function generateNextSupplierAllocationReference(
  txClient?: TxClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `IMP-${yearMonth}-`;

  const last = await db.supplierAdditionalPaymentAllocation.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (last?.reference) {
    const parts = last.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── CONSULTATION DES TOTAUX ET HISTORIQUE D'IMPUTATION ───────────────────────

export async function getSupplierAllocationsSummary(supplierId: number): Promise<{
  totalGiven: number;
  totalAllocated: number;
  unallocatedAmount: number;
}> {
  try {
    const totalGiven = await getSupplierAdditionalPaymentTotal(supplierId);

    const allocationsAgg = await prisma.supplierAdditionalPaymentAllocation.aggregate({
      where: {
        supplierId,
        isReversal: false,
        status: "completed",
      },
      _sum: { amount: true },
    });

    const totalAllocated = allocationsAgg._sum.amount ?? 0;
    const unallocatedAmount = Math.max(0, Math.round((totalGiven - totalAllocated) * 100) / 100);

    return {
      totalGiven,
      totalAllocated,
      unallocatedAmount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      return { totalGiven: 0, totalAllocated: 0, unallocatedAmount: 0 };
    }
    throw err;
  }
}

export interface EligibleAdditionalPaymentItem {
  id: number;
  reference: string;
  date: Date | string;
  originalAmount: number;
  alreadyAllocated: number;
  remainingAmount: number;
  paymentMethod: string;
  description: string | null;
  accountName: string;
}

export async function getSupplierEligibleAdditionalPayments(
  supplierId: number
): Promise<EligibleAdditionalPaymentItem[]> {
  try {
    const payments = await prisma.supplierAdditionalPayment.findMany({
      where: {
        supplierId,
        isReversal: false,
        status: "completed",
      },
      include: {
        treasuryAccount: {
          select: { name: true },
        },
        allocations: {
          where: {
            isReversal: false,
            status: "completed",
          },
          select: {
            amount: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });

    const items: EligibleAdditionalPaymentItem[] = [];

    for (const p of payments) {
      const alreadyAllocated = p.allocations.reduce((sum, a) => sum + a.amount, 0);
      const remainingAmount = Math.max(0, Math.round((p.amount - alreadyAllocated) * 100) / 100);

      if (remainingAmount > 0) {
        items.push({
          id: p.id,
          reference: p.reference,
          date: p.date,
          originalAmount: p.amount,
          alreadyAllocated,
          remainingAmount,
          paymentMethod: p.paymentMethod,
          description: p.description || p.notes,
          accountName: p.treasuryAccount.name,
        });
      }
    }

    return items;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) return [];
    throw err;
  }
}


export async function getSupplierAllocationHistory(supplierId: number) {
  try {
    const items = await prisma.supplierAdditionalPaymentAllocation.findMany({
      where: { supplierId },
      include: {
        payment: {
          select: { id: true, reference: true, amount: true, date: true },
        },
        purchase: {
          select: { id: true, reference: true, totalAmount: true, paidAmount: true },
        },
        reversal: {
          select: { id: true, reference: true, date: true, reversalReason: true },
        },
        reversalOf: {
          select: { id: true, reference: true },
        },
      },
      orderBy: { date: "desc" },
    });

    return items;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) return [];
    throw err;
  }
}


export async function getSupplierUnpaidPurchases(supplierId: number) {
  try {
    const purchases = await prisma.purchase.findMany({
      where: {
        supplierId,
        status: { not: "cancelled" },
        paymentStatus: { in: ["unpaid", "partial"] },
      },
      orderBy: { purchaseDate: "desc" },
    });

    return purchases.map((p) => ({
      id: p.id,
      reference: p.reference,
      totalAmount: p.totalAmount,
      paidAmount: p.paidAmount,
      remainingAmount: Math.max(0, Math.round((p.totalAmount - p.paidAmount) * 100) / 100),
      purchaseDate: p.purchaseDate.toISOString(),
    }));
  } catch (err: unknown) {
    console.error("Erreur getSupplierUnpaidPurchases:", err);
    return [];
  }
}

// ─── CRÉER UNE IMPUTATION DE VERSEMENT SUR LA DETTE ───────────────────────────

export interface CreateAllocationInput {
  supplierId: number;
  paymentId: number;
  amount: number;
  purchaseId?: number | null;
  supplierDebtId?: number | null;
  date?: string;
  description?: string;
  notes?: string;
  idempotencyKey?: string;
}

export async function createSupplierAdditionalPaymentAllocationAction(
  payload: CreateAllocationInput
): Promise<AllocationActionResponse> {
  try {
    const supplierId = Number(payload.supplierId);
    const paymentId = Number(payload.paymentId);
    const amount = Number(payload.amount);
    const purchaseId = payload.purchaseId ? Number(payload.purchaseId) : null;
    const supplierDebtId = payload.supplierDebtId ? Number(payload.supplierDebtId) : null;
    const date = payload.date ? new Date(payload.date) : new Date();
    const description = payload.description?.trim() || null;
    const notes = payload.notes?.trim() || null;
    const idempotencyKey = payload.idempotencyKey?.trim() || null;

    if (!supplierId || isNaN(supplierId)) {
      return { success: false, error: "Fournisseur invalide ou non renseigné." };
    }

    if (!paymentId || isNaN(paymentId)) {
      return { success: false, error: "Veuillez sélectionner un versement supplémentaire à imputer." };
    }

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant d'imputation doit être strictement supérieur à 0 DA." };
    }

    await assertPeriodNotLocked(date, "Imputation versement fournisseur");

    const result = await prisma.$transaction(
      async (tx) => {
        // Concurrence : verrouillage d'écriture
        await tx.supplier.update({
          where: { id: supplierId },
          data: { updatedAt: new Date() },
        });

        // 1. Contrôle d'idempotence
        if (idempotencyKey) {
          const existing = await tx.supplierAdditionalPaymentAllocation.findUnique({
            where: { idempotencyKey },
            include: { payment: true, purchase: true },
          });

          if (existing) {
            // Comparaison des paramètres significatifs
            const isMatch =
              existing.supplierId === supplierId &&
              existing.paymentId === paymentId &&
              Math.abs(existing.amount - amount) < 0.001 &&
              (existing.purchaseId ?? null) === (purchaseId ?? null);

            if (isMatch) {
              return { allocation: existing, isDuplicate: true };
            } else {
              throw new Error("Idempotency conflict: Une imputation différente existe déjà avec cette même clé.");
            }
          }
        }

        // 2. Vérification du versement original
        const payment = await tx.supplierAdditionalPayment.findUnique({
          where: { id: paymentId },
          include: {
            allocations: {
              where: {
                isReversal: false,
                status: "completed",
              },
            },
          },
        });

        if (!payment) {
          throw new Error("Le versement supplémentaire spécifié est introuvable.");
        }

        if (payment.supplierId !== supplierId) {
          throw new Error("Le versement sélectionné n'appartient pas au fournisseur désigné.");
        }

        if (payment.isReversal || payment.status === "reversed") {
          throw new Error("Impossible d'imputer un versement annulé ou contrepassé.");
        }

        // 3. Contrôle du solde disponible sur ce versement
        const alreadyAllocated = payment.allocations.reduce((sum, a) => sum + a.amount, 0);
        const remainingOnPayment = Math.max(0, Math.round((payment.amount - alreadyAllocated) * 100) / 100);

        if (amount > remainingOnPayment) {
          throw new Error(
            `Le montant d'imputation (${amount.toLocaleString(
              "fr-DZ"
            )} DA) dépasse le solde disponible (${remainingOnPayment.toLocaleString(
              "fr-DZ"
            )} DA) sur le versement ${payment.reference}.`
          );
        }

        // 4. Contrôle de la dette globale du fournisseur
        const debtInfo = await calculateSupplierDebt(supplierId, tx);
        if (amount > debtInfo.outstandingDebt) {
          throw new Error(
            `Le montant d'imputation (${amount.toLocaleString(
              "fr-DZ"
            )} DA) dépasse la dette fournisseur restante (${debtInfo.outstandingDebt.toLocaleString(
              "fr-DZ"
            )} DA). Aucun solde négatif de dette n'est autorisé.`
          );
        }

        // 5. Contrôle et mise à jour de la commande d'achat si sélectionnée
        let linkedPurchaseRef: string | null = null;
        if (purchaseId) {
          const purchase = await tx.purchase.findUnique({
            where: { id: purchaseId },
          });

          if (!purchase) {
            throw new Error("La commande d'achat spécifiée est introuvable.");
          }

          if (purchase.supplierId !== supplierId) {
            throw new Error("La commande d'achat sélectionnée n'appartient pas à ce fournisseur.");
          }

          if (purchase.status === "cancelled") {
            throw new Error("Impossible d'imputer sur une commande d'achat annulée.");
          }

          const remainingPurchaseDebt = Math.max(0, Math.round((purchase.totalAmount - purchase.paidAmount) * 100) / 100);
          if (amount > remainingPurchaseDebt) {
            throw new Error(
              `Le montant d'imputation (${amount.toLocaleString(
                "fr-DZ"
              )} DA) dépasse le reste dû sur la commande ${purchase.reference} (${remainingPurchaseDebt.toLocaleString(
                "fr-DZ"
              )} DA).`
            );
          }

          linkedPurchaseRef = purchase.reference;
          const newPaidAmount = Math.round((purchase.paidAmount + amount) * 100) / 100;
          const newPaymentStatus = newPaidAmount >= purchase.totalAmount ? "paid" : "partial";

          await tx.purchase.update({
            where: { id: purchaseId },
            data: {
              paidAmount: newPaidAmount,
              paymentStatus: newPaymentStatus,
              updatedAt: new Date(),
            },
          });
        }

        // 6. Génération de référence et création de l'enregistrement d'imputation
        const reference = await generateNextSupplierAllocationReference(tx);
        const autoDesc = description || (
          linkedPurchaseRef
            ? `Imputation versement ${payment.reference} sur achat ${linkedPurchaseRef}`
            : `Imputation versement ${payment.reference} sur dette globale`
        );

        const allocation = await tx.supplierAdditionalPaymentAllocation.create({
          data: {
            reference,
            paymentId,
            supplierId,
            purchaseId,
            supplierDebtId,
            amount,
            date,
            status: "completed",
            isReversal: false,
            notes,
            description: autoDesc,
            idempotencyKey,
          },
        });

        // NOTA BENE : AUCUN IMPACT EN TRÉSORERIE (0 DA)
        return { allocation, isDuplicate: false };
      },
      { timeout: 15000, maxWait: 10000 }
    );

    safeRevalidate();

    const alloc = result.allocation;
    return {
      success: true,
      message: result.isDuplicate
        ? `Opération déjà enregistrée (Réf: ${alloc.reference}).`
        : `Imputation de ${alloc.amount.toLocaleString(
            "fr-DZ"
          )} DA enregistrée avec succès (Réf: ${alloc.reference}). Trésorerie inchangée.`,
      data: alloc,
    };
  } catch (err: unknown) {
    console.error("Erreur createSupplierAdditionalPaymentAllocationAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inattendue lors de l'imputation.",
    };
  }
}

// ─── ANNULATION / CONTREPASSATION D'UNE IMPUTATION ────────────────────────────

export interface ReverseAllocationInput {
  allocationId: number;
  reason: string;
  idempotencyKey?: string;
}

export async function reverseSupplierAdditionalPaymentAllocationAction(
  payload: ReverseAllocationInput
): Promise<AllocationActionResponse> {
  try {
    const allocationId = Number(payload.allocationId);
    const reason = payload.reason?.trim();
    const idempotencyKey = payload.idempotencyKey?.trim() || null;

    if (!allocationId || isNaN(allocationId)) {
      return { success: false, error: "Identifiant de l'imputation invalide." };
    }

    if (!reason || reason.length < 5) {
      return {
        success: false,
        error: "Un motif explicatif détaillé (au moins 5 caractères) est obligatoire pour annuler cette imputation.",
      };
    }

    const now = new Date();
    await assertPeriodNotLocked(now, "Annulation d'imputation fournisseur");

    const result = await prisma.$transaction(
      async (tx) => {
        // Concurrence : verrouillage d'écriture
        await tx.supplierAdditionalPaymentAllocation.update({
          where: { id: allocationId },
          data: { updatedAt: new Date() },
        });

        // Contrôle d'idempotence
        if (idempotencyKey) {
          const existing = await tx.supplierAdditionalPaymentAllocation.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            return { reversal: existing, isDuplicate: true };
          }
        }

        const original = await tx.supplierAdditionalPaymentAllocation.findUnique({
          where: { id: allocationId },
          include: {
            payment: true,
            purchase: true,
            reversal: true,
          },
        });

        if (!original) {
          throw new Error("Imputation introuvable.");
        }

        if (original.isReversal) {
          throw new Error("Impossible d'annuler une écriture de contrepassation.");
        }

        if (original.status === "reversed" || original.reversal || original.reversedAt) {
          throw new Error("Cette imputation a déjà été contrepassée.");
        }

        // 1. Rétablissement de la commande d'achat si elle était liée
        if (original.purchaseId && original.purchase) {
          const newPaidAmount = Math.max(0, Math.round((original.purchase.paidAmount - original.amount) * 100) / 100);
          const newPaymentStatus =
            newPaidAmount >= original.purchase.totalAmount && original.purchase.totalAmount > 0
              ? "paid"
              : newPaidAmount > 0
              ? "partial"
              : "unpaid";

          await tx.purchase.update({
            where: { id: original.purchaseId },
            data: {
              paidAmount: newPaidAmount,
              paymentStatus: newPaymentStatus,
              updatedAt: now,
            },
          });
        }

        const reversalRef = await generateNextSupplierAllocationReference(tx);

        // 2. Création de l'écriture compensatoire (Ledger append-only)
        const reversal = await tx.supplierAdditionalPaymentAllocation.create({
          data: {
            reference: reversalRef,
            paymentId: original.paymentId,
            supplierId: original.supplierId,
            purchaseId: original.purchaseId,
            supplierDebtId: original.supplierDebtId,
            amount: original.amount,
            date: now,
            status: "completed",
            isReversal: true,
            reversalOfId: original.id,
            reversalReason: reason,
            description: `Contrepassation de l'imputation ${original.reference}`,
            notes: `Motif : ${reason}`,
            idempotencyKey,
          },
        });

        // 3. Mise à jour de l'imputation originale vers 'reversed'
        await tx.supplierAdditionalPaymentAllocation.update({
          where: { id: original.id },
          data: {
            status: "reversed",
            reversedAt: now,
            reversalReason: reason,
            updatedAt: now,
          },
        });

        // NOTA BENE : AUCUN IMPACT EN TRÉSORERIE (0 DA)
        return { reversal, isDuplicate: false };
      },
      { timeout: 15000, maxWait: 10000 }
    );

    safeRevalidate();

    const rev = result.reversal;
    return {
      success: true,
      message: result.isDuplicate
        ? `Contrepassation déjà effectuée (Réf: ${rev.reference}).`
        : `Imputation contrepassée avec succès (Réf: ${rev.reference}). Dette rétablie, trésorerie inchangée.`,
      data: rev,
    };
  } catch (err: unknown) {
    console.error("Erreur reverseSupplierAdditionalPaymentAllocationAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inattendue lors de la contrepassation.",
    };
  }
}
