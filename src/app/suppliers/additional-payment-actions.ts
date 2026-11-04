"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { PrismaTransactionClient } from "@/lib/inventory-transaction";
import { calculateAccountBalance } from "@/app/cash/treasury-actions";
import { assertPeriodNotLocked } from "@/lib/period-lock";

export type AdditionalPaymentActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate(path?: string) {
  try {
    revalidatePath(path || "/suppliers");
    revalidatePath("/cash");
    revalidatePath("/cash/journal");
  } catch {
    // Silently ignore in tests/non-Next context
  }
}

// ─── GÉNÉRATION DE RÉFÉRENCE ──────────────────────────────────────────────────

export async function generateNextSupplierAdditionalPaymentReference(
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `VRS-${yearMonth}-`;

  const last = await db.supplierAdditionalPayment.findFirst({
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

// ─── CONSULTATION DES TOTAUX ET HISTORIQUE ─────────────────────────────────────

export async function getSupplierAdditionalPaymentTotal(supplierId: number): Promise<number> {
  try {
    const [payments, reversals] = await Promise.all([
      prisma.supplierAdditionalPayment.aggregate({
        where: {
          supplierId,
          isReversal: false,
        },
        _sum: { amount: true },
      }),
      prisma.supplierAdditionalPayment.aggregate({
        where: {
          supplierId,
          isReversal: true,
          status: "completed",
        },
        _sum: { amount: true },
      }),
    ]);

    const totalGiven = (payments._sum.amount ?? 0) - (reversals._sum.amount ?? 0);
    return Math.round(totalGiven * 100) / 100;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) return 0;
    throw err;
  }
}

export async function getSupplierAdditionalPaymentHistory(supplierId: number) {
  try {
    const items = await prisma.supplierAdditionalPayment.findMany({
      where: { supplierId },
      include: {
        treasuryAccount: {
          select: { id: true, name: true, code: true, type: true },
        },
        session: {
          select: { id: true, reference: true, status: true },
        },
        reversal: {
          select: { id: true, reference: true, date: true, createdAt: true, reversalReason: true },
        },
        reversalOf: {
          select: { id: true, reference: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    return items;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) return [];
    throw err;
  }
}

// ─── ACTION : DONNER DE L'ARGENT AU FOURNISSEUR ────────────────────────────────

export async function createSupplierAdditionalPaymentAction(payload: {
  supplierId: number;
  amount: number;
  treasuryAccountId: number;
  paymentMethod?: string;
  date?: string;
  description?: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<AdditionalPaymentActionResponse> {
  try {
    const supplierId = Number(payload.supplierId);
    const amount = Number(payload.amount);
    const treasuryAccountId = Number(payload.treasuryAccountId);
    const paymentMethod = payload.paymentMethod || "cash";
    const description = payload.description?.trim() || null;
    const notes = payload.notes?.trim() || null;
    const idempotencyKey = payload.idempotencyKey?.trim() || null;

    if (!supplierId || isNaN(supplierId)) {
      return { success: false, error: "Fournisseur invalide ou non spécifié." };
    }

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant à verser doit être un nombre strictement supérieur à 0 DA." };
    }

    if (!treasuryAccountId || isNaN(treasuryAccountId)) {
      return { success: false, error: "Veuillez sélectionner un compte de trésorerie source valide." };
    }

    let paymentDate = new Date();
    if (payload.date) {
      const trimmed = payload.date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        paymentDate = new Date(`${trimmed}T12:00:00.000Z`);
      } else {
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) paymentDate = parsed;
      }
    }

    // Protection des périodes comptables clôturées
    await assertPeriodNotLocked(paymentDate, "Versement supplémentaire fournisseur");

    const result = await prisma.$transaction(
      async (tx) => {
        // Idempotence : vérification préalable
        if (idempotencyKey) {
          const existing = await tx.supplierAdditionalPayment.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            const matches =
              existing.supplierId === supplierId &&
              Math.abs(existing.amount - amount) < 0.001 &&
              existing.treasuryAccountId === treasuryAccountId;
            if (matches) {
              return { payment: existing, isDuplicate: true };
            }
            throw new Error("Idempotency conflict: Une opération différente existe déjà avec cette même clé.");
          }
        }

        const supplier = await tx.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, isActive: true },
        });
        if (!supplier) {
          throw new Error("Fournisseur introuvable.");
        }

        const account = await tx.treasuryAccount.findUnique({
          where: { id: treasuryAccountId },
        });
        if (!account) {
          throw new Error("Compte de trésorerie introuvable.");
        }
        if (!account.isActive) {
          throw new Error(`Le compte de trésorerie "${account.name}" est inactif.`);
        }

        // Verrouillage de concurrence SQLite sur le compte
        await tx.treasuryAccount.update({
          where: { id: treasuryAccountId },
          data: { updatedAt: new Date() },
        });

        // Contrôle spécifique à la caisse journalière (session active exigée)
        const isCashAccount = account.type === "cash" || account.isDefault;
        let activeSessionId: number | null = null;
        if (isCashAccount) {
          const activeSession = await tx.cashSession.findFirst({
            where: { status: "open" },
          });
          if (!activeSession) {
            throw new Error(
              "Une session de caisse active est obligatoire pour effectuer un versement en espèces depuis la caisse journalière."
            );
          }
          activeSessionId = activeSession.id;

          // Mise à jour atomique du total des décaissements de la session
          await tx.cashSession.update({
            where: { id: activeSession.id },
            data: { totalCashOut: { increment: amount } },
          });
        }

        // Contrôle du solde disponible (anti-découvert)
        const currentBalance = await calculateAccountBalance(treasuryAccountId, tx);
        if (currentBalance < amount) {
          throw new Error(
            `Solde insuffisant sur le compte "${account.name}". Solde disponible : ${currentBalance.toLocaleString(
              "fr-DZ"
            )} DA, montant demandé : ${amount.toLocaleString("fr-DZ")} DA.`
          );
        }

        // Génération de la référence séquentielle
        const reference = await generateNextSupplierAdditionalPaymentReference(tx);

        const newPayment = await tx.supplierAdditionalPayment.create({
          data: {
            reference,
            supplierId,
            amount,
            treasuryAccountId,
            paymentMethod,
            date: paymentDate,
            status: "completed",
            description: description || `Versement supplémentaire fournisseur — ${supplier.name}`,
            notes,
            idempotencyKey,
            sessionId: activeSessionId,
            isReversal: false,
          },
        });

        return { payment: newPayment, isDuplicate: false };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    safeRevalidate();

    return {
      success: true,
      message: result.isDuplicate
        ? `Opération déjà enregistrée (${result.payment.reference}).`
        : `Versement de ${amount.toLocaleString("fr-DZ")} DA au fournisseur validé avec succès (${result.payment.reference}).`,
      data: result.payment,
    };
  } catch (err: unknown) {
    console.error("Erreur createSupplierAdditionalPaymentAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inattendue lors de l'enregistrement du versement.",
    };
  }
}

// ─── ACTION : CONTREPASSER UN VERSEMENT SUPPLÉMENTAIRE ────────────────────────

export async function reverseSupplierAdditionalPaymentAction(payload: {
  paymentId: number;
  reason: string;
  idempotencyKey?: string;
}): Promise<AdditionalPaymentActionResponse> {
  try {
    const paymentId = Number(payload.paymentId);
    const reason = payload.reason?.trim();
    const idempotencyKey = payload.idempotencyKey?.trim() || null;

    if (!paymentId || isNaN(paymentId)) {
      return { success: false, error: "Identifiant du versement invalide." };
    }

    if (!reason || reason.length < 5) {
      return {
        success: false,
        error: "Un motif explicatif détaillé (au moins 5 caractères) est obligatoire pour annuler cette transaction.",
      };
    }

    const now = new Date();
    await assertPeriodNotLocked(now, "Annulation de versement fournisseur");

    const result = await prisma.$transaction(
      async (tx) => {
        // Idempotence
        if (idempotencyKey) {
          const existing = await tx.supplierAdditionalPayment.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            return { reversal: existing, isDuplicate: true };
          }
        }

        const original = await tx.supplierAdditionalPayment.findUnique({
          where: { id: paymentId },
          include: {
            treasuryAccount: true,
            supplier: true,
            reversal: true,
          },
        });

        if (!original) {
          throw new Error("Versement fournisseur introuvable.");
        }

        if (original.isReversal) {
          throw new Error("Impossible d'annuler une écriture de contrepassation.");
        }

        if (original.status === "reversed" || original.reversal || original.reversedAt) {
          throw new Error("Cette transaction a déjà été contrepassée.");
        }

        // Verrouillage de concurrence sur le compte de trésorerie
        await tx.treasuryAccount.update({
          where: { id: original.treasuryAccountId },
          data: { updatedAt: new Date() },
        });

        // Si Caisse journalière, vérifier session active pour l'encaissement de restitution
        const isCashAccount = original.treasuryAccount.type === "cash" || original.treasuryAccount.isDefault;
        let activeSessionId: number | null = null;
        if (isCashAccount) {
          const activeSession = await tx.cashSession.findFirst({
            where: { status: "open" },
          });
          if (activeSession) {
            activeSessionId = activeSession.id;
            await tx.cashSession.update({
              where: { id: activeSession.id },
              data: { totalCashIn: { increment: original.amount } },
            });
          }
        }

        const reversalRef = await generateNextSupplierAdditionalPaymentReference(tx);

        // 1. Création de l'écriture compensatoire (Ledger append-only)
        const reversal = await tx.supplierAdditionalPayment.create({
          data: {
            reference: reversalRef,
            supplierId: original.supplierId,
            amount: original.amount,
            treasuryAccountId: original.treasuryAccountId,
            paymentMethod: original.paymentMethod,
            date: now,
            status: "completed",
            description: `Contrepassation versement ${original.reference} : ${reason}`,
            notes: `Annulation du versement ${original.reference}. Motif: ${reason}`,
            idempotencyKey,
            sessionId: activeSessionId,
            isReversal: true,
            reversalOfId: original.id,
          },
        });

        // 2. Marquage de l'opération d'origine
        await tx.supplierAdditionalPayment.update({
          where: { id: original.id },
          data: {
            status: "reversed",
            reversedAt: now,
            reversalReason: reason,
          },
        });

        return { reversal, isDuplicate: false };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    safeRevalidate();

    return {
      success: true,
      message: result.isDuplicate
        ? `Annulation déjà enregistrée (${result.reversal.reference}).`
        : `Contrepassation enregistrée avec succès (${result.reversal.reference}). Les fonds ont été restitués au compte.`,
      data: result.reversal,
    };
  } catch (err: unknown) {
    console.error("Erreur reverseSupplierAdditionalPaymentAction:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inattendue lors de l'annulation du versement.",
    };
  }
}
