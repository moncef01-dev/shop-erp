"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ShopSettingsData } from "@/app/settings/actions";
import { assertPeriodNotLocked, assertDatesNotLocked } from "@/lib/period-lock";
import {
  generateNextTreasuryTransferReference,
  generateNextTreasuryAccountCode,
  calculateAccountBalance,
  getTreasuryDashboardData,
  createTreasuryAccountAction,
  updateTreasuryAccountAction,
  createTreasuryTransferAction,
  updateTreasuryTransferAction,
  adjustAccountBalanceAction,
  getAccountMovements,
  type TreasuryAccountData,
  type TreasuryTransferData,
  type AccountMovementItem,
  type TreasuryDashboardSummary,
} from "./treasury-actions";

export {
  generateNextTreasuryTransferReference,
  generateNextTreasuryAccountCode,
  calculateAccountBalance,
  getTreasuryDashboardData,
  createTreasuryAccountAction,
  updateTreasuryAccountAction,
  createTreasuryTransferAction,
  updateTreasuryTransferAction,
  adjustAccountBalanceAction,
  getAccountMovements,
  type TreasuryAccountData,
  type TreasuryTransferData,
  type AccountMovementItem,
  type TreasuryDashboardSummary,
};

export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface CashActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Revalidation outside HTTP context (e.g. testing) is safely ignored
  }
}

// ─── GÉNÉRATEURS DE RÉFÉRENCES SÉQUENTIELLES UNIQUE ──────────────────────────

export async function generateNextCashSessionReference(txClient?: PrismaTransactionClient): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CS-${yearMonth}-`;

  const last = await db.cashSession.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (last?.reference) {
    const parts = last.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function generateNextExpenseReference(
  type: "expense" | "income" = "expense",
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = type === "income" ? `ENC-${yearMonth}-` : `DEP-${yearMonth}-`;

  const last = await db.expense.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (last?.reference) {
    const parts = last.reference.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── GESTION DES SESSIONS DE CAISSE (OUVERTURE & CLÔTURE) ────────────────────

export async function openCashSessionAction(
  payload:
    | number
    | {
        openingAmount: number;
        openingNotes?: string;
        openedAt?: string;
        includePendingCash?: boolean;
      },
  notesArg?: string
): Promise<CashActionResponse> {
  try {
    const isObj = typeof payload === "object" && payload !== null;
    const openingAmount = isObj ? Number(payload.openingAmount) : Number(payload);
    const openingNotes = isObj ? payload.openingNotes?.trim() || null : notesArg?.trim() || null;
    const openedAt = isObj && payload.openedAt ? new Date(payload.openedAt) : new Date();
    const includePendingCash = isObj ? Boolean(payload.includePendingCash) : false;

    await assertPeriodNotLocked(openedAt, "Ouverture de session de caisse");

    if (includePendingCash) {
      const [pendingPayments, pendingExpenses] = await Promise.all([
        prisma.payment.findMany({
          where: { sessionId: null, method: "cash", status: { not: "cancelled" } },
          select: { paymentDate: true },
        }),
        prisma.expense.findMany({
          where: { sessionId: null, method: "cash" },
          select: { date: true },
        }),
      ]);
      await assertDatesNotLocked(
        [
          openedAt,
          ...pendingPayments.map((p) => p.paymentDate),
          ...pendingExpenses.map((e) => e.date),
        ],
        "Ouverture de session de caisse avec rattachement"
      );
    }

    if (isNaN(openingAmount) || openingAmount < 0) {
      return {
        success: false,
        error: "Le solde d'ouverture doit être un montant positif ou nul en DA.",
      };
    }

    // Vérifier si une session est déjà ouverte (conception mono-caisse)
    const existingActive = await prisma.cashSession.findFirst({
      where: { status: "open" },
    });

    if (existingActive) {
      return {
        success: false,
        error: `Une session de caisse est déjà active (${existingActive.reference}) ouverte le ${new Date(
          existingActive.openedAt
        ).toLocaleDateString("fr-DZ")}. Veuillez clôturer la session en cours avant d'en ouvrir une nouvelle.`,
      };
    }

    const reference = await generateNextCashSessionReference();

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.cashSession.create({
        data: {
          reference,
          status: "open",
          openingAmount,
          openedAt,
          openingNotes,
        },
      });

      if (includePendingCash) {
        await tx.payment.updateMany({
          where: { sessionId: null, method: "cash", status: { not: "cancelled" } },
          data: { sessionId: created.id },
        });
        await tx.expense.updateMany({
          where: { sessionId: null, method: "cash" },
          data: { sessionId: created.id },
        });
      }

      return created;
    });

    safeRevalidate("/cash");
    safeRevalidate("/sales");

    return {
      success: true,
      message: `Session de caisse ${reference} ouverte avec succès (Fond de caisse : ${openingAmount.toLocaleString(
        "fr-DZ"
      )} DA)${includePendingCash ? " avec rattachement des espèces hors session." : "."}`,
      data: session,
    };
  } catch (err: unknown) {
    console.error("Erreur ouverture session caisse:", err);
    return {
      success: false,
      error: "Erreur lors de l'ouverture de la session de caisse.",
    };
  }
}

export async function reconcileOutOfSessionCashAction(sessionId: number): Promise<CashActionResponse> {
  try {
    const session = await prisma.cashSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return { success: false, error: "Session de caisse introuvable." };
    if (session.status !== "open") {
      return { success: false, error: "Les encaissements ne peuvent être rattachés qu'à une session de caisse ouverte." };
    }

    const defaultCaisse =
      (await prisma.treasuryAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
      (await prisma.treasuryAccount.findFirst({ where: { type: "cash", isActive: true } }));
    const caisseId = defaultCaisse?.id;

    const unlinkedPayments = await prisma.payment.findMany({
      where: {
        sessionId: null,
        method: "cash",
        status: { not: "cancelled" },
        OR: [{ accountId: caisseId }, { accountId: null }],
      },
      select: { id: true, amount: true, paymentDate: true },
    });

    const unlinkedExpenses = await prisma.expense.findMany({
      where: {
        sessionId: null,
        method: "cash",
        OR: [{ accountId: caisseId }, { accountId: null }],
      },
      select: { id: true, amount: true, type: true, date: true },
    });

    if (unlinkedPayments.length === 0 && unlinkedExpenses.length === 0) {
      return { success: false, error: "Aucun mouvement en espèces hors session en attente de réconciliation." };
    }

    await assertDatesNotLocked(
      [
        session.openedAt,
        ...unlinkedPayments.map((p) => p.paymentDate),
        ...unlinkedExpenses.map((e) => e.date),
      ],
      "Rattachement hors session de caisse"
    );

    const paymentIds = unlinkedPayments.map((p) => p.id);
    const expenseIds = unlinkedExpenses.map((e) => e.id);

    await prisma.$transaction(async (tx) => {
      if (paymentIds.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: paymentIds } },
          data: { sessionId: session.id },
        });
      }
      if (expenseIds.length > 0) {
        await tx.expense.updateMany({
          where: { id: { in: expenseIds } },
          data: { sessionId: session.id },
        });
      }
    });

    safeRevalidate("/cash");
    safeRevalidate("/sales");

    const totalReconciled = unlinkedPayments.reduce((acc, p) => acc + p.amount, 0);
    return {
      success: true,
      message: `${paymentIds.length + expenseIds.length} opération(s) en espèces (${totalReconciled.toLocaleString("fr-DZ")} DA) rattachée(s) avec succès à la session de caisse ${session.reference}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur réconciliation caisse hors session:", err);
    return { success: false, error: "Erreur lors du rattachement des opérations à la session de caisse." };
  }
}

export async function closeCashSessionAction(
  payload:
    | number
    | {
        sessionId: number;
        closingAmount: number;
        closingNotes?: string;
        transferAmount?: number;
        transferDestinationAccountId?: number;
        transferNotes?: string;
      },
  closingAmountArg?: number,
  closingNotesArg?: string,
  transferAmountArg?: number,
  transferDestinationAccountIdArg?: number,
  transferNotesArg?: string
): Promise<CashActionResponse> {
  try {
    const isObj = typeof payload === "object" && payload !== null;
    const sessionId = isObj ? Number(payload.sessionId) : Number(payload);
    const closingAmount = isObj ? Number(payload.closingAmount ?? (payload as any).countedAmount) : Number(closingAmountArg);
    const closingNotes = isObj ? (payload.closingNotes ?? (payload as any).notes) : closingNotesArg;
    const transferAmount = isObj
      ? (payload.transferAmount !== undefined ? Number(payload.transferAmount) : 0)
      : (transferAmountArg !== undefined ? Number(transferAmountArg) : 0);
    const transferDestinationAccountId = isObj
      ? (payload.transferDestinationAccountId ?? (payload as any).destinationAccountId)
      : transferDestinationAccountIdArg;
    const transferNotes = isObj ? payload.transferNotes : transferNotesArg;

    if (isNaN(closingAmount) || closingAmount < 0) {
      return {
        success: false,
        error: "Le montant physique compté doit être un nombre positif ou nul en DA.",
      };
    }

    if (isNaN(transferAmount) || transferAmount < 0) {
      return {
        success: false,
        error: "Le montant à transférer doit être un nombre positif ou nul en DA.",
      };
    }

    if (transferAmount > closingAmount) {
      return {
        success: false,
        error: `Le montant à transférer (${transferAmount.toLocaleString(
          "fr-DZ"
        )} DA) ne peut dépasser le montant physique compté (${closingAmount.toLocaleString("fr-DZ")} DA).`,
      };
    }

    if (transferAmount > 0 && !transferDestinationAccountId) {
      return {
        success: false,
        error: "Veuillez sélectionner un compte de destination pour le transfert de fonds.",
      };
    }

    const session = await prisma.cashSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { success: false, error: "Session de caisse introuvable." };
    }

    if (session.status === "closed") {
      return {
        success: false,
        error: "Cette session de caisse est déjà clôturée et ne peut plus être modifiée (archivage immuable).",
      };
    }

    const now = new Date();

    await assertDatesNotLocked([session.openedAt, now], "Clôture de session de caisse");

    const defaultCaisse =
      (await prisma.treasuryAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
      (await prisma.treasuryAccount.findFirst({ where: { type: "cash", isActive: true } }));
    const caisseId = defaultCaisse?.id;

    // Calcul autoritaire côté serveur sur la fenêtre [openedAt, now] et les opérations rattachées
    // 1. Encaissements physiques (Ventes et encaissements en espèces)
    const salesPayments = await prisma.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        purchaseId: null,
        supplierId: null,
        OR: [
          { sessionId: sessionId },
          {
            sessionId: null,
            OR: [
              { paymentDate: { gte: session.openedAt, lte: now } },
              { createdAt: { gte: session.openedAt, lte: now } },
            ],
            AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
          },
        ],
      },
      select: { id: true, amount: true },
    });
    const cashInSales = salesPayments.reduce((acc, p) => acc + p.amount, 0);

    // 2. Décaissements physiques (Fournisseurs en espèces)
    const supplierPayments = await prisma.payment.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        AND: [
          { OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }] },
          {
            OR: [
              { sessionId: sessionId },
              {
                sessionId: null,
                OR: [
                  { paymentDate: { gte: session.openedAt, lte: now } },
                  { createdAt: { gte: session.openedAt, lte: now } },
                ],
                AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
              },
            ],
          },
        ],
      },
      select: { id: true, amount: true },
    });
    const cashOutPurchases = supplierPayments.reduce((acc, p) => acc + p.amount, 0);

    // 3. Acomptes clients reçus en espèces
    const customerAdvances = await prisma.customerAdvance.findMany({
      where: {
        status: { not: "cancelled" },
        method: "cash",
        OR: [
          { sessionId: sessionId },
          {
            sessionId: null,
            OR: [
              { paymentDate: { gte: session.openedAt, lte: now } },
              { createdAt: { gte: session.openedAt, lte: now } },
            ],
            AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
          },
        ],
      },
      select: { id: true, amount: true },
    });
    const cashInAdvances = customerAdvances.reduce((acc, a) => acc + a.amount, 0);

    // 4. Charges et encaissements exceptionnels en espèces
    const expenses = await prisma.expense.findMany({
      where: {
        method: "cash",
        OR: [
          { sessionId: sessionId },
          {
            sessionId: null,
            OR: [
              { date: { gte: session.openedAt, lte: now } },
              { createdAt: { gte: session.openedAt, lte: now } },
            ],
            AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
          },
        ],
      },
      select: { id: true, amount: true, type: true },
    });
    const cashOutExpenses = expenses
      .filter((e) => e.type === "expense")
      .reduce((acc, e) => acc + e.amount, 0);
    const cashInOther = expenses
      .filter((e) => e.type === "income")
      .reduce((acc, e) => acc + e.amount, 0);

    // 5. Transferts internes affectant la caisse pendant la session
    const transfersIn = caisseId
      ? await prisma.treasuryTransfer.findMany({
          where: {
            toAccountId: caisseId,
            OR: [
              { sessionId: sessionId },
              {
                sessionId: null,
                OR: [
                  { date: { gte: session.openedAt, lte: now } },
                  { createdAt: { gte: session.openedAt, lte: now } },
                ],
              },
            ],
          },
          select: { id: true, amount: true },
        })
      : [];
    const cashInTransfers = transfersIn.reduce((acc, t) => acc + t.amount, 0);

    const transfersOut = caisseId
      ? await prisma.treasuryTransfer.findMany({
          where: {
            fromAccountId: caisseId,
            OR: [
              { sessionId: sessionId },
              {
                sessionId: null,
                OR: [
                  { date: { gte: session.openedAt, lte: now } },
                  { createdAt: { gte: session.openedAt, lte: now } },
                ],
              },
            ],
          },
          select: { id: true, amount: true },
        })
      : [];
    const cashOutTransfers = transfersOut.reduce((acc, t) => acc + t.amount, 0);

    const totalCashIn = cashInSales + cashInAdvances + cashInOther + cashInTransfers;
    const totalCashOut = cashOutPurchases + cashOutExpenses + cashOutTransfers;
    const theoreticalAmount = session.openingAmount + totalCashIn - totalCashOut;
    const difference = closingAmount - theoreticalAmount;

    // Mise à jour atomique de clôture & transfert optionnel
    const { updatedSession, transferInfo } = await prisma.$transaction(async (tx) => {
      // 1. Clôturer la session
      const updated = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: "closed",
          closedAt: now,
          totalCashIn,
          totalCashOut,
          theoreticalAmount,
          closingAmount,
          difference,
          originalClosingAmount: closingAmount,
          originalTheoreticalAmount: theoreticalAmount,
          originalDifference: difference,
          retainedAmount: Math.max(0, closingAmount - transferAmount),
          closingNotes: closingNotes?.trim() || null,
        },
      });

      // 2. Lier la session aux paiements, dépenses, acomptes et transferts concernés
      const paymentIds = [...salesPayments.map((p) => p.id), ...supplierPayments.map((p) => p.id)];
      if (paymentIds.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: paymentIds } },
          data: { sessionId: sessionId },
        });
      }

      const advanceIds = customerAdvances.map((a) => a.id);
      if (advanceIds.length > 0) {
        await tx.customerAdvance.updateMany({
          where: { id: { in: advanceIds } },
          data: { sessionId: sessionId },
        });
      }

      const expenseIds = expenses.map((e) => e.id);
      if (expenseIds.length > 0) {
        await tx.expense.updateMany({
          where: { id: { in: expenseIds } },
          data: { sessionId: sessionId },
        });
      }

      const transferIds = [...transfersIn.map((t) => t.id), ...transfersOut.map((t) => t.id)];
      if (transferIds.length > 0) {
        await tx.treasuryTransfer.updateMany({
          where: { id: { in: transferIds } },
          data: { sessionId: sessionId },
        });
      }

      // 3. Enregistrer le transfert de clôture si un montant a été spécifié par l'utilisateur
      let transferResult: { reference: string; destName: string } | null = null;
      if (transferAmount > 0 && transferDestinationAccountId) {
        let sourceAccount = await tx.treasuryAccount.findFirst({
          where: { isDefault: true },
        });
        if (!sourceAccount) {
          sourceAccount = await tx.treasuryAccount.findFirst({
            where: { type: "cash" },
          });
        }
        if (!sourceAccount) {
          sourceAccount = await tx.treasuryAccount.create({
            data: {
              code: "ACC-CAISSE",
              name: "Caisse journalière",
              type: "cash",
              openingBalance: 0,
              isDefault: true,
              isActive: true,
            },
          });
        }

        if (sourceAccount.id === transferDestinationAccountId) {
          throw new Error("Le compte de destination du transfert doit être différent de la caisse journalière.");
        }

        const destAccount = await tx.treasuryAccount.findUnique({
          where: { id: transferDestinationAccountId },
        });
        if (!destAccount || !destAccount.isActive) {
          throw new Error("Compte de destination du transfert introuvable ou inactif.");
        }

        const trfRef = await generateNextTreasuryTransferReference(tx);
        await tx.treasuryTransfer.create({
          data: {
            reference: trfRef,
            fromAccountId: sourceAccount.id,
            toAccountId: destAccount.id,
            amount: transferAmount,
            motif: transferNotes?.trim() || `Transfert clôture de caisse ${session.reference}`,
            date: now,
            sessionId: sessionId,
          },
        });

        transferResult = { reference: trfRef, destName: destAccount.name };
      }

      return { updatedSession: updated, transferInfo: transferResult };
    });

    safeRevalidate("/cash");
    safeRevalidate("/purchases");
    safeRevalidate("/suppliers");

    let diffMsg = "";
    if (difference === 0) {
      diffMsg = "Caisse parfaitement équilibrée (Écart: 0 DA).";
    } else if (difference > 0) {
      diffMsg = `Excédent de caisse constaté : +${difference.toLocaleString("fr-DZ")} DA.`;
    } else {
      diffMsg = `Déficit de caisse constaté : ${difference.toLocaleString("fr-DZ")} DA.`;
    }

    const retainedAmount = closingAmount - transferAmount;
    const transferMsg = transferInfo
      ? ` Transfert de ${transferAmount.toLocaleString("fr-DZ")} DA vers "${
          transferInfo.destName
        }" validé (${transferInfo.reference}). Espèces conservées en caisse : ${retainedAmount.toLocaleString(
          "fr-DZ"
        )} DA.`
      : "";

    return {
      success: true,
      message: `Session ${updatedSession.reference} clôturée avec succès. ${diffMsg}${transferMsg}`,
      data: updatedSession,
    };
  } catch (err: unknown) {
    console.error("Erreur clôture session caisse:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors de la clôture de la session de caisse.";
    return {
      success: false,
      error: msg,
    };
  }
}

// ─── CORRECTION TEMPORAIRE D'UNE SESSION CLÔTURÉE (AUDIT TRAIL & RÉCONCILIATION) ─

export async function editClosedCashSessionAction(payload: {
  sessionId: number;
  newClosingAmount: number;
  newTransferAmount?: number;
  newTransferDestinationAccountId?: number;
  newClosingNotes?: string;
  reason: string;
}): Promise<CashActionResponse> {
  try {
    const sessionId = Number(payload.sessionId);
    const newClosingAmount = Number(payload.newClosingAmount);
    const newTransferAmount = payload.newTransferAmount !== undefined ? Number(payload.newTransferAmount) : 0;
    const newTransferDestinationAccountId = payload.newTransferDestinationAccountId;
    const reason = payload.reason?.trim();
    const newClosingNotes = payload.newClosingNotes?.trim() || null;

    if (!reason || reason.length < 3) {
      return {
        success: false,
        error: "Le motif / justification explicite de la correction de clôture est obligatoire pour l'audit comptable.",
      };
    }

    if (isNaN(newClosingAmount) || newClosingAmount < 0) {
      return {
        success: false,
        error: "Le montant physique compté corrigé doit être un nombre positif ou nul en DA.",
      };
    }

    if (newTransferAmount > newClosingAmount) {
      return {
        success: false,
        error: `Le montant à transférer (${newTransferAmount.toLocaleString(
          "fr-DZ"
        )} DA) ne peut dépasser le montant physique compté (${newClosingAmount.toLocaleString("fr-DZ")} DA).`,
      };
    }

    const session = await prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        transfers: true,
      },
    });

    if (!session) {
      return { success: false, error: "Session de caisse introuvable." };
    }

    if (session.status !== "closed") {
      return {
        success: false,
        error: "Seule une session clôturée peut faire l'objet d'une correction de clôture.",
      };
    }

    const now = new Date();
    await assertDatesNotLocked(
      [session.openedAt, session.closedAt ?? session.openedAt, now],
      "Modification d'une session de caisse clôturée"
    );

    const origClosing = session.originalClosingAmount ?? session.closingAmount ?? 0;
    const origTheoretical = session.originalTheoreticalAmount ?? session.theoreticalAmount ?? 0;
    const origDiff = session.originalDifference ?? session.difference ?? 0;

    const theoreticalAmount = session.theoreticalAmount ?? 0;
    const newDifference = newClosingAmount - theoreticalAmount;
    const newRetainedAmount = Math.max(0, newClosingAmount - newTransferAmount);

    const auditRecord = {
      editedAt: now.toISOString(),
      reason,
      previous: {
        closingAmount: session.closingAmount,
        difference: session.difference,
        retainedAmount: session.retainedAmount,
        transfers: session.transfers.map((t) => ({
          id: t.id,
          reference: t.reference,
          amount: t.amount,
          toAccountId: t.toAccountId,
        })),
      },
      next: {
        closingAmount: newClosingAmount,
        difference: newDifference,
        retainedAmount: newRetainedAmount,
        transferAmount: newTransferAmount,
        transferDestinationAccountId: newTransferDestinationAccountId,
      },
    };

    let existingAudit: unknown[] = [];
    if (session.closingEditAudit) {
      try {
        existingAudit = JSON.parse(session.closingEditAudit);
      } catch {
        existingAudit = [];
      }
    }
    existingAudit.push(auditRecord);

    await prisma.$transaction(async (tx) => {
      // 1. Mise à jour des valeurs corrigées de la session
      await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          closingAmount: newClosingAmount,
          difference: newDifference,
          retainedAmount: newRetainedAmount,
          originalClosingAmount: origClosing,
          originalTheoreticalAmount: origTheoretical,
          originalDifference: origDiff,
          closingNotes: newClosingNotes || session.closingNotes,
          closingEditAudit: JSON.stringify(existingAudit),
        },
      });

      // 2. Réconciliation sans doublon avec le virement existant
      const existingTransfer = session.transfers[0];
      const targetDestAccountId = newTransferDestinationAccountId || existingTransfer?.toAccountId;

      if (newTransferAmount > 0 && targetDestAccountId) {
        if (existingTransfer) {
          await tx.treasuryTransfer.update({
            where: { id: existingTransfer.id },
            data: {
              amount: newTransferAmount,
              toAccountId: targetDestAccountId,
              motif: `Correction clôture de caisse ${session.reference} (${reason})`,
            },
          });
        } else {
          const defaultCashAcc =
            (await tx.treasuryAccount.findFirst({ where: { isDefault: true } })) ||
            (await tx.treasuryAccount.findFirst({ where: { type: "cash" } }));

          if (defaultCashAcc) {
            const trfRef = await generateNextTreasuryTransferReference(tx);
            await tx.treasuryTransfer.create({
              data: {
                reference: trfRef,
                fromAccountId: defaultCashAcc.id,
                toAccountId: targetDestAccountId,
                amount: newTransferAmount,
                motif: `Transfert correction clôture ${session.reference}`,
                date: now,
                sessionId: sessionId,
              },
            });
          }
        }
      } else if (newTransferAmount === 0 && existingTransfer) {
        await tx.treasuryTransfer.delete({
          where: { id: existingTransfer.id },
        });
      }
    });

    safeRevalidate("/cash");

    return {
      success: true,
      message: `Clôture de caisse ${session.reference} corrigée avec succès. Montant physique : ${newClosingAmount.toLocaleString(
        "fr-DZ"
      )} DA, Écart recalculé : ${newDifference.toLocaleString("fr-DZ")} DA (audit tracé).`,
    };
  } catch (err: unknown) {
    console.error("Erreur modification clôture caisse:", err);
    return {
      success: false,
      error: "Erreur lors de la modification de la clôture de caisse.",
    };
  }
}

// ─── GESTION DES DÉPENSES & ENCAISSEMENTS MANUELS ─────────────────────────────

export async function createExpenseAction(formData: FormData): Promise<CashActionResponse> {
  try {
    const type = (formData.get("type") as string) || "expense";
    const category = (formData.get("category") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const amountStr = formData.get("amount") as string;
    const method = (formData.get("method") as string) || "cash";
    const beneficiary = (formData.get("beneficiary") as string)?.trim() || null;
    const receiptNumber = (formData.get("receiptNumber") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;
    const dateStr = formData.get("date") as string;
    const accountIdStr = formData.get("accountId") as string;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: "Le montant doit être un nombre strictement supérieur à zéro en DA.",
      };
    }

    const date = dateStr ? new Date(dateStr) : new Date();
    await assertPeriodNotLocked(date, type === "income" ? "Enregistrement d'un encaissement" : "Enregistrement d'une dépense");

    if (!description || description.length < 3) {
      return {
        success: false,
        error: "La description / motif est obligatoire (au moins 3 caractères).",
      };
    }

    if (!category) {
      return {
        success: false,
        error: "Veuillez sélectionner une catégorie valide pour cette opération.",
      };
    }

    const validMethods = ["cash", "transfer", "check", "cib"];
    if (!validMethods.includes(method)) {
      return {
        success: false,
        error: "Mode de règlement non reconnu.",
      };
    }

    // Détermination du compte de trésorerie affecté
    let accountId: number | null = accountIdStr ? parseInt(accountIdStr, 10) : null;
    if (accountId) {
      const acc = await prisma.treasuryAccount.findUnique({ where: { id: accountId } });
      if (!acc) return { success: false, error: "Compte de trésorerie sélectionné introuvable." };
      if (!acc.isActive) return { success: false, error: `Le compte "${acc.name}" est inactif.` };
      if (type === "expense") {
        const available = await calculateAccountBalance(accountId);
        if (available < amount) {
          return {
            success: false,
            error: `Solde insuffisant sur le compte "${acc.name}". Solde disponible : ${available.toLocaleString(
              "fr-DZ"
            )} DA, dépense demandée : ${amount.toLocaleString("fr-DZ")} DA.`,
          };
        }
      }
    } else {
      if (method === "cash") {
        const def = await prisma.treasuryAccount.findFirst({ where: { isDefault: true } });
        if (def) accountId = def.id;
      } else if (method === "transfer") {
        const defBank = await prisma.treasuryAccount.findFirst({ where: { code: "ACC-BANQUE" } });
        if (defBank) accountId = defBank.id;
      }
    }

    // Si règlement en espèces, rattacher automatiquement à la session ouverte s'il y en a une
    let sessionId: number | null = null;
    if (method === "cash") {
      const activeSession = await prisma.cashSession.findFirst({
        where: { status: "open" },
      });
      if (activeSession) {
        sessionId = activeSession.id;
      }
    }

    const reference = await generateNextExpenseReference(type === "income" ? "income" : "expense");

    const expense = await prisma.expense.create({
      data: {
        reference,
        type: type === "income" ? "income" : "expense",
        category,
        description,
        amount,
        method,
        beneficiary,
        receiptNumber,
        notes,
        date,
        sessionId,
        accountId,
      },
    });

    safeRevalidate("/cash");

    const label = type === "income" ? "Encaissement" : "Dépense";
    return {
      success: true,
      message: `${label} ${reference} enregistrée avec succès (${amount.toLocaleString("fr-DZ")} DA via ${
        method === "cash" ? "Espèces" : method === "cib" ? "CIB" : method === "check" ? "Chèque" : "Virement"
      }).`,
      data: expense,
    };
  } catch (err: unknown) {
    console.error("Erreur création dépense:", err);
    return {
      success: false,
      error: "Erreur lors de l'enregistrement de la dépense.",
    };
  }
}

export async function deleteExpenseAction(expenseId: number): Promise<CashActionResponse> {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { session: true },
    });

    if (!expense) {
      return { success: false, error: "Dépense introuvable." };
    }

    if (expense.session && expense.session.status === "closed") {
      return {
        success: false,
        error: "Impossible de supprimer une dépense rattachée à une session de caisse déjà clôturée.",
      };
    }

    await assertPeriodNotLocked(expense.date, "Suppression de dépense / encaissement");

    await prisma.expense.delete({ where: { id: expenseId } });

    safeRevalidate("/cash");

    return {
      success: true,
      message: `La pièce ${expense.reference} a été supprimée avec succès.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression dépense:", err);
    return {
      success: false,
      error: "Erreur lors de la suppression de la dépense.",
    };
  }
}

// ─── TYPES & INTERFACES DU JOURNAL ET DU TABLEAU DE BORD ─────────────────────

export interface CashLedgerItem {
  id: string; // Ex: pay-1, payf-2, exp-3, trf-4
  rawId: number;
  reference: string;
  date: string;
  createdAt?: string;
  type: "encaissement" | "decaissement" | "transfer";
  source: "sale" | "purchase" | "expense" | "income" | "transfer";
  category: string;
  description: string;
  partyName: string;
  docReference?: string | null;
  method: string; // cash, transfer, check, cib, internal_transfer
  amount: number;
  notes?: string | null;
  affectsCash: boolean; // true si method === "cash"
  sessionId?: number | null;
  sessionRef?: string | null;
  accountId?: number | null;
  accountName?: string | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
}

export interface TreasuryChannelSummary {
  method: string;
  label: string;
  inflows: number;
  outflows: number;
  net: number;
}

export interface OutOfSessionCashSummary {
  pendingCashIn: number;
  pendingCashOut: number;
  pendingNet: number;
  itemsCount: number;
  items: CashLedgerItem[];
}

export interface CashDashboardData {
  activeSession: {
    id: number;
    reference: string;
    openedAt: string;
    openingAmount: number;
    openingNotes?: string | null;
    status: string;
    currentCashIn: number;
    currentCashOut: number;
    currentTheoreticalCash: number;
    eligibleTransactionsCount: number;
  } | null;
  outOfSessionCash: OutOfSessionCashSummary;
  sessions: {
    id: number;
    reference: string;
    openedAt: string;
    closedAt?: string | null;
    status: string;
    openingAmount: number;
    totalCashIn: number;
    totalCashOut: number;
    theoreticalAmount?: number | null;
    closingAmount?: number | null;
    difference?: number | null;
    originalClosingAmount?: number | null;
    originalTheoreticalAmount?: number | null;
    originalDifference?: number | null;
    retainedAmount?: number | null;
    closingEditAudit?: string | null;
    transfers?: {
      id: number;
      reference: string;
      amount: number;
      toAccountId: number;
      toAccountName: string;
    }[];
    openingNotes?: string | null;
    closingNotes?: string | null;
  }[];
  ledger: CashLedgerItem[];
  metrics: {
    // Caisse physique
    physicalOpening: number;
    physicalInflows: number;
    physicalOutflows: number;
    physicalTheoretical: number;
    physicalCounted?: number | null;
    physicalDiscrepancy?: number | null;
    // Canaux bancaires & électroniques
    channels: Record<string, TreasuryChannelSummary>;
    // Trésorerie globale
    globalInflows: number;
    globalOutflows: number;
    globalNet: number;
  };
  treasury: TreasuryDashboardSummary;
  settings?: ShopSettingsData | null;
  expensesCount: number;
}

function formatExpenseCategory(cat: string): string {
  switch (cat) {
    case "transport":
      return "Transport & Livraison";
    case "utilities":
      return "Électricité, Gaz & Eau";
    case "rent":
      return "Loyer & Charges locatives";
    case "maintenance":
      return "Entretien & Réparations";
    case "supplies":
      return "Fournitures de bureau";
    case "salary":
      return "Salaires & Avances";
    case "capital":
      return "Apport personnel exploitant";
    case "refund":
      return "Remboursement reçu";
    case "misc_income":
      return "Recette diverse";
    default:
      return cat.charAt(0).toUpperCase() + cat.slice(1);
  }
}

// ─── REQUÊTE PRINCIPALE : AUDIT & AGRÉGATION COMPLÈTE DU JOURNAL ──────────────

export async function getCashDashboardData(filters?: {
  startDate?: string;
  endDate?: string;
  method?: string;
  type?: string;
  searchQuery?: string;
}): Promise<CashDashboardData> {
  const query = filters?.searchQuery?.trim().toLowerCase();

  // 1. Récupérer toutes les sessions de caisse
  const sessions = await prisma.cashSession.findMany({
    orderBy: { openedAt: "desc" },
    include: {
      transfers: {
        include: {
          toAccount: { select: { id: true, name: true, code: true } },
          fromAccount: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  const activeRaw = sessions.find((s) => s.status === "open") || null;

  // 2. Récupérer l'ensemble des paiements existants (Clients & Fournisseurs) non annulés
  const payments = await prisma.payment.findMany({
    where: {
      status: { not: "cancelled" },
    },
    include: {
      sale: {
        include: {
          customer: true,
        },
      },
      purchase: {
        include: {
          supplier: true,
        },
      },
      supplier: true,
      account: {
        select: { id: true, name: true, code: true },
      },
      session: {
        select: { id: true, reference: true },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  // 3. Récupérer l'ensemble des dépenses et mouvements manuels
  const expenses = await prisma.expense.findMany({
    include: {
      account: {
        select: { id: true, name: true, code: true },
      },
      session: {
        select: { id: true, reference: true },
      },
    },
    orderBy: { date: "desc" },
  });

  // 4. Récupérer l'ensemble des transferts de trésorerie
  const transfers = await prisma.treasuryTransfer.findMany({
    include: {
      fromAccount: { select: { id: true, name: true, code: true, type: true } },
      toAccount: { select: { id: true, name: true, code: true, type: true } },
      session: { select: { id: true, reference: true } },
    },
    orderBy: { date: "desc" },
  });

  // 4.1 Récupérer l'ensemble des acomptes clients non annulés
  const advances = await prisma.customerAdvance.findMany({
    where: {
      status: { not: "cancelled" },
    },
    include: {
      customer: { select: { name: true } },
      account: { select: { id: true, name: true, code: true } },
      session: { select: { id: true, reference: true } },
    },
    orderBy: { paymentDate: "desc" },
  });

  const defaultCashAcc =
    (await prisma.treasuryAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await prisma.treasuryAccount.findFirst({ where: { type: "cash", isActive: true } }));
  const defaultCashAccId = defaultCashAcc?.id;

  // 5. Construire le Grand Livre unifié (Ledger) sans doublons
  const ledgerItems: CashLedgerItem[] = [];

  // 5.1 Encaissements clients (depuis payments où saleId != null)
  for (const p of payments) {
    if (p.saleId !== null) {
      const customerName = p.sale?.customer?.name || "Client Passager / Comptoir";
      ledgerItems.push({
        id: `pay-${p.id}`,
        rawId: p.id,
        reference: p.reference || `PAY-${String(p.id).padStart(4, "0")}`,
        date: p.paymentDate.toISOString(),
        createdAt: p.createdAt.toISOString(),
        type: "encaissement",
        source: "sale",
        category: "Vente Meubles",
        description: `Règlement vente ${p.sale?.reference || ""} — ${customerName}`,
        partyName: customerName,
        docReference: p.sale?.reference,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash:
          (p.method || "cash") === "cash" && (p.accountId === defaultCashAccId || p.accountId === null),
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
        accountId: p.accountId,
        accountName: p.account?.name || null,
      });
    } else if (p.purchaseId !== null || p.supplierId !== null) {
      // 5.2 Décaissements fournisseurs (depuis payments où purchaseId != null ou supplierId != null)
      const supplierName = p.purchase?.supplier?.name || p.supplier?.name || "Fournisseur";
      ledgerItems.push({
        id: `payf-${p.id}`,
        rawId: p.id,
        reference: p.reference || `PAYF-${String(p.id).padStart(4, "0")}`,
        date: p.paymentDate.toISOString(),
        createdAt: p.createdAt.toISOString(),
        type: "decaissement",
        source: "purchase",
        category: "Achat Fournisseur",
        description: `Règlement fournisseur — ${supplierName}`,
        partyName: supplierName,
        docReference: p.purchase?.reference || null,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash:
          (p.method || "cash") === "cash" && (p.accountId === defaultCashAccId || p.accountId === null),
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
        accountId: p.accountId,
        accountName: p.account?.name || null,
      });
    } else {
      // 5.2.1 Paiements directs (ex: encaissement direct)
      ledgerItems.push({
        id: `pay-${p.id}`,
        rawId: p.id,
        reference: p.reference || `PAY-${String(p.id).padStart(4, "0")}`,
        date: p.paymentDate.toISOString(),
        createdAt: p.createdAt.toISOString(),
        type: "encaissement",
        source: "sale",
        category: "Encaissement Caisse",
        description: p.notes || "Encaissement direct en caisse",
        partyName: "Client Comptoir",
        docReference: null,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash:
          (p.method || "cash") === "cash" && (p.accountId === defaultCashAccId || p.accountId === null),
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
        accountId: p.accountId,
        accountName: p.account?.name || null,
      });
    }
  }

  // 5.2.2 Acomptes clients reçus
  for (const adv of advances) {
    ledgerItems.push({
      id: `adv-${adv.id}`,
      rawId: adv.id,
      reference: adv.reference,
      date: adv.paymentDate.toISOString(),
      createdAt: adv.createdAt.toISOString(),
      type: "encaissement",
      source: "sale",
      category: "Acompte Client",
      description: `Acompte client — ${adv.customer?.name || "Client"}`,
      partyName: adv.customer?.name || "Client",
      docReference: null,
      method: adv.method || "cash",
      amount: adv.amount,
      notes: adv.notes,
      affectsCash:
        (adv.method || "cash") === "cash" && (adv.accountId === defaultCashAccId || adv.accountId === null),
      sessionId: adv.sessionId,
      sessionRef: adv.session?.reference,
      accountId: adv.accountId,
      accountName: adv.account?.name || null,
    });
  }

  // 5.3 Dépenses d'exploitation et encaissements exceptionnels (depuis expenses)
  for (const e of expenses) {
    const isIncome = e.type === "income";
    ledgerItems.push({
      id: isIncome ? `inc-${e.id}` : `exp-${e.id}`,
      rawId: e.id,
      reference: e.reference,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      type: isIncome ? "encaissement" : "decaissement",
      source: isIncome ? "income" : "expense",
      category: formatExpenseCategory(e.category),
      description: e.description,
      partyName: e.beneficiary || "Interne Magasin",
      docReference: e.receiptNumber,
      method: e.method || "cash",
      amount: e.amount,
      notes: e.notes,
      affectsCash:
        (e.method || "cash") === "cash" && (e.accountId === defaultCashAccId || e.accountId === null),
      sessionId: e.sessionId,
      sessionRef: e.session?.reference,
      accountId: e.accountId,
      accountName: e.account?.name || null,
    });
  }

  // 5.4 Mouvements de virements internes entre comptes (sans impacter chiffre d'affaires ni charges)
  for (const t of transfers) {
    const isFromCash = t.fromAccountId === defaultCashAccId;
    const isToCash = t.toAccountId === defaultCashAccId;
    ledgerItems.push({
      id: `trf-${t.id}`,
      rawId: t.id,
      reference: t.reference,
      date: t.date.toISOString(),
      createdAt: t.createdAt.toISOString(),
      type: "transfer",
      source: "transfer",
      category: "Virement Interne",
      description: `Transfert ${t.fromAccount.name} → ${t.toAccount.name} (${t.motif})`,
      partyName: `${t.fromAccount.name} → ${t.toAccount.name}`,
      docReference: t.session?.reference || null,
      method: "internal_transfer",
      amount: t.amount,
      notes: t.notes,
      affectsCash: isFromCash || isToCash,
      sessionId: t.sessionId,
      sessionRef: t.session?.reference,
      accountId: t.fromAccountId,
      accountName: `${t.fromAccount.name} → ${t.toAccount.name}`,
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
    });
  }

  // Tri chronologique décroissant
  ledgerItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 6. Calculs des métriques temps réel pour la session active
  let activeSessionData = null;
  if (activeRaw) {
    const sessionStart = new Date(activeRaw.openedAt).getTime();
    const sessionCashItems = ledgerItems.filter((item) => {
      if (!item.affectsCash) return false;
      if (item.sessionId === activeRaw.id) return true;
      if (item.sessionId !== null && item.sessionId !== undefined) return false;
      const t = new Date(item.date).getTime();
      const tCreated = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      return t >= sessionStart || tCreated >= sessionStart;
    });

    const currentCashIn = sessionCashItems
      .filter((i) => {
        if (i.type === "encaissement") return true;
        if (i.type === "transfer" && i.toAccountId === defaultCashAccId) return true;
        return false;
      })
      .reduce((acc, i) => acc + i.amount, 0);

    const currentCashOut = sessionCashItems
      .filter((i) => {
        if (i.type === "decaissement") return true;
        if (i.type === "transfer" && i.fromAccountId === defaultCashAccId) return true;
        return false;
      })
      .reduce((acc, i) => acc + i.amount, 0);

    const currentTheoreticalCash = activeRaw.openingAmount + currentCashIn - currentCashOut;

    activeSessionData = {
      id: activeRaw.id,
      reference: activeRaw.reference,
      openedAt: activeRaw.openedAt.toISOString(),
      openingAmount: activeRaw.openingAmount,
      openingNotes: activeRaw.openingNotes,
      status: activeRaw.status,
      currentCashIn,
      currentCashOut,
      currentTheoreticalCash,
      eligibleTransactionsCount: sessionCashItems.length,
    };
  }

  // 6.2 Calcul des opérations en espèces hors session en attente de réconciliation
  const pendingCashItems = ledgerItems.filter((item) => {
    if (!item.affectsCash) return false;
    if (item.type === "transfer") return false; // les transferts ne sont pas des espèces en attente
    if (item.sessionId !== null) return false;
    if (activeRaw) {
      const sessionStart = new Date(activeRaw.openedAt).getTime();
      const t = new Date(item.date).getTime();
      const tCreated = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      if (t >= sessionStart || tCreated >= sessionStart) return false;
    }
    return true;
  });

  const pendingCashIn = pendingCashItems
    .filter((i) => i.type === "encaissement")
    .reduce((acc, i) => acc + i.amount, 0);

  const pendingCashOut = pendingCashItems
    .filter((i) => i.type === "decaissement")
    .reduce((acc, i) => acc + i.amount, 0);

  const pendingNet = pendingCashIn - pendingCashOut;

  const outOfSessionCash: OutOfSessionCashSummary = {
    pendingCashIn,
    pendingCashOut,
    pendingNet,
    itemsCount: pendingCashItems.length,
    items: pendingCashItems,
  };

  // 7. Application des filtres sur le ledger affiché
  let filteredLedger = ledgerItems;

  if (filters?.startDate) {
    const start = new Date(filters.startDate).setHours(0, 0, 0, 0);
    filteredLedger = filteredLedger.filter((i) => new Date(i.date).getTime() >= start);
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate).setHours(23, 59, 59, 999);
    filteredLedger = filteredLedger.filter((i) => new Date(i.date).getTime() <= end);
  }
  if (filters?.method && filters.method !== "all") {
    filteredLedger = filteredLedger.filter((i) => i.method === filters.method);
  }
  if (filters?.type && filters.type !== "all") {
    filteredLedger = filteredLedger.filter((i) => i.type === filters.type);
  }
  if (query) {
    filteredLedger = filteredLedger.filter(
      (i) =>
        i.reference.toLowerCase().includes(query) ||
        i.description.toLowerCase().includes(query) ||
        i.partyName.toLowerCase().includes(query) ||
        i.category.toLowerCase().includes(query) ||
        (i.docReference && i.docReference.toLowerCase().includes(query))
    );
  }

  // 8. Agrégation des flux par canal de paiement (sans doubler ni inclure les transferts internes)
  const channels: Record<string, TreasuryChannelSummary> = {
    cash: { method: "cash", label: "Espèces (Caisse Physique)", inflows: 0, outflows: 0, net: 0 },
    transfer: { method: "transfer", label: "Virement bancaire", inflows: 0, outflows: 0, net: 0 },
    check: { method: "check", label: "Chèque bancaire", inflows: 0, outflows: 0, net: 0 },
    cib: { method: "cib", label: "Carte CIB / Edahabia", inflows: 0, outflows: 0, net: 0 },
  };

  for (const item of ledgerItems) {
    if (item.type === "transfer") continue; // Les virements internes ne modifient pas les recettes/dépenses externes
    const rawMethod = (item.method || "cash").toLowerCase();
    const normMethod =
      rawMethod === "bank_transfer" || rawMethod === "virement"
        ? "transfer"
        : rawMethod === "cheque"
        ? "check"
        : rawMethod;
    const m = channels[normMethod] || channels.cash;
    if (item.type === "encaissement") {
      m.inflows += item.amount;
    } else {
      m.outflows += item.amount;
    }
    m.net = m.inflows - m.outflows;
  }

  const globalInflows = Object.values(channels).reduce((acc, c) => acc + c.inflows, 0);
  const globalOutflows = Object.values(channels).reduce((acc, c) => acc + c.outflows, 0);
  const globalNet = globalInflows - globalOutflows;

  // Calcul caisse physique
  const physicalOpening = activeSessionData ? activeSessionData.openingAmount : 0;
  const physicalInflows = activeSessionData ? activeSessionData.currentCashIn : channels.cash.inflows;
  const physicalOutflows = activeSessionData ? activeSessionData.currentCashOut : channels.cash.outflows;
  const physicalTheoretical = activeSessionData
    ? activeSessionData.currentTheoreticalCash
    : channels.cash.inflows - channels.cash.outflows;

  const treasuryData = await getTreasuryDashboardData();
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

  return {
    activeSession: activeSessionData,
    outOfSessionCash,
    sessions: sessions.map((s) => ({
      id: s.id,
      reference: s.reference,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      status: s.status,
      openingAmount: s.openingAmount,
      totalCashIn: s.totalCashIn,
      totalCashOut: s.totalCashOut,
      theoreticalAmount: s.theoreticalAmount,
      closingAmount: s.closingAmount,
      difference: s.difference,
      originalClosingAmount: s.originalClosingAmount,
      originalTheoreticalAmount: s.originalTheoreticalAmount,
      originalDifference: s.originalDifference,
      retainedAmount: s.retainedAmount,
      closingEditAudit: s.closingEditAudit,
      transfers: (s.transfers || []).map((t) => ({
        id: t.id,
        reference: t.reference,
        amount: t.amount,
        toAccountId: t.toAccountId,
        toAccountName: t.toAccount?.name || "Compte Coffre",
      })),
      openingNotes: s.openingNotes,
      closingNotes: s.closingNotes,
    })),
    ledger: filteredLedger,
    settings,
    treasury: treasuryData,
    metrics: {
      physicalOpening,
      physicalInflows,
      physicalOutflows,
      physicalTheoretical,
      physicalCounted: null,
      physicalDiscrepancy: null,
      channels,
      globalInflows,
      globalOutflows,
      globalNet,
    },
    expensesCount: expenses.length,
  };
}

// ─── JOURNAL JOURNALIER DE TRÉSORERIE (CAISSE JOURNALIÈRE PHYSIQUE) ───────────

export interface DailyCashJournalItem {
  id: string;
  timestamp: string;
  dateFormatted: string;
  reference: string;
  operationType: string;
  operationBadgeClass: string;
  description: string;
  partyName: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  method: string;
  docReference?: string | null;
  source: "sale" | "purchase" | "advance" | "expense" | "income" | "transfer";
  sessionId?: number | null;
}

export interface DailyCashJournalData {
  selectedDate: string; // YYYY-MM-DD
  formattedDate: string; // "mercredi 21 octobre 2026"
  isToday: boolean;
  caisseAccount: {
    id: number;
    code: string;
    name: string;
  };
  session: {
    id: number;
    reference: string;
    status: "open" | "closed";
    openedAt: string;
    closedAt?: string | null;
    openingAmount: number;
    closingAmount?: number | null;
  } | null;
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  operatingInflows: number;
  operatingOutflows: number;
  transfersIn: number;
  transfersOut: number;
  netTransfers: number;
  netOperatingFlow: number;
  theoreticalFinalBalance: number;
  items: DailyCashJournalItem[];
  availableDates: string[];
}

export async function getDailyCashJournal(dateStr?: string): Promise<DailyCashJournalData> {
  // 1. Identification du compte de caisse physique principale
  const defaultCaisse =
    (await prisma.treasuryAccount.findFirst({
      where: { isDefault: true, isActive: true },
    })) ||
    (await prisma.treasuryAccount.findFirst({
      where: { type: "cash", isActive: true },
    })) ||
    (await prisma.treasuryAccount.findFirst({
      where: { type: "cash" },
    }));

  if (!defaultCaisse) {
    throw new Error("Compte de caisse journalière introuvable.");
  }
  const caisseId = defaultCaisse.id;

  // 2. Normalisation de la date demandée (fuseau local du magasin)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const targetDayStr = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : todayStr;
  const isToday = targetDayStr === todayStr;

  const targetDateObj = new Date(`${targetDayStr}T12:00:00.000Z`);
  const formattedDate = targetDateObj.toLocaleDateString("fr-DZ", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 3. Identification des sessions de caisse ouvertes ou enregistrées pour ce jour
  const sessionsOnDay = await prisma.cashSession.findMany({
    where: {
      OR: [
        {
          openedAt: {
            gte: new Date(`${targetDayStr}T00:00:00.000Z`),
            lte: new Date(`${targetDayStr}T23:59:59.999Z`),
          },
        },
        {
          createdAt: {
            gte: new Date(`${targetDayStr}T00:00:00.000Z`),
            lte: new Date(`${targetDayStr}T23:59:59.999Z`),
          },
        },
      ],
    },
    orderBy: { openedAt: "desc" },
  });

  const sessionIdsForDay = new Set(sessionsOnDay.map((s) => s.id));
  const primarySession = sessionsOnDay[0] || null;

  // 4. Détermination rigoureuse du solde initial du jour
  let openingBalance = 0;
  if (primarySession) {
    openingBalance = primarySession.openingAmount;
  } else {
    // Si aucune session n'a été ouverte ce jour, chercher la dernière session clôturée antérieure
    const priorClosedSession = await prisma.cashSession.findFirst({
      where: {
        status: "closed",
        closedAt: { lt: new Date(`${targetDayStr}T00:00:00.000Z`) },
      },
      orderBy: { closedAt: "desc" },
    });

    if (priorClosedSession && priorClosedSession.closedAt) {
      // Pas de report automatique du reliquat de clôture précédent : démarrage à 0 DA
      let bal = 0;
      const cutoff = priorClosedSession.closedAt;
      const dayStart = new Date(`${targetDayStr}T00:00:00.000Z`);

      const [trIn, trOut, pIn, advIn, incIn, suppOut, expOut] = await Promise.all([
        prisma.treasuryTransfer.aggregate({
          where: { toAccountId: caisseId, date: { gt: cutoff, lt: dayStart } },
          _sum: { amount: true },
        }),
        prisma.treasuryTransfer.aggregate({
          where: { fromAccountId: caisseId, date: { gt: cutoff, lt: dayStart } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            purchaseId: null,
            supplierId: null,
            OR: [{ accountId: caisseId }, { accountId: null }],
            paymentDate: { gt: cutoff, lt: dayStart },
          },
          _sum: { amount: true },
        }),
        prisma.customerAdvance.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            OR: [{ accountId: caisseId }, { accountId: null }],
            paymentDate: { gt: cutoff, lt: dayStart },
          },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: {
            type: "income",
            method: "cash",
            OR: [{ accountId: caisseId }, { accountId: null }],
            date: { gt: cutoff, lt: dayStart },
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            status: { not: "cancelled" },
            method: "cash",
            OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }],
            AND: [{ OR: [{ accountId: caisseId }, { accountId: null }] }],
            paymentDate: { gt: cutoff, lt: dayStart },
          },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: {
            type: "expense",
            method: "cash",
            OR: [{ accountId: caisseId }, { accountId: null }],
            date: { gt: cutoff, lt: dayStart },
          },
          _sum: { amount: true },
        }),
      ]);

      bal += (trIn._sum.amount ?? 0) - (trOut._sum.amount ?? 0);
      bal += (pIn._sum.amount ?? 0) + (advIn._sum.amount ?? 0) + (incIn._sum.amount ?? 0);
      bal -= (suppOut._sum.amount ?? 0) + (expOut._sum.amount ?? 0);
      openingBalance = Math.round(bal * 100) / 100;
    } else {
      openingBalance = defaultCaisse.openingBalance;
    }
  }

  // 5. Requêtage de tous les flux physiques en espèces liés à la caisse
  const [salePayments, customerAdvances, allExpenses, suppPayments, transfers, allSessions] =
    await Promise.all([
      prisma.payment.findMany({
        where: {
          status: { not: "cancelled" },
          method: "cash",
          purchaseId: null,
          supplierId: null,
          OR: [{ accountId: caisseId }, { accountId: null }],
        },
        include: { sale: { include: { customer: true } } },
      }),
      prisma.customerAdvance.findMany({
        where: {
          status: { not: "cancelled" },
          method: "cash",
          OR: [{ accountId: caisseId }, { accountId: null }],
        },
        include: { customer: true },
      }),
      prisma.expense.findMany({
        where: {
          method: "cash",
          OR: [{ accountId: caisseId }, { accountId: null }],
        },
      }),
      prisma.payment.findMany({
        where: {
          status: { not: "cancelled" },
          method: "cash",
          AND: [
            { OR: [{ purchaseId: { not: null } }, { supplierId: { not: null } }] },
            { OR: [{ accountId: caisseId }, { accountId: null }] },
          ],
        },
        include: { purchase: { include: { supplier: true } }, supplier: true },
      }),
      prisma.treasuryTransfer.findMany({
        where: {
          OR: [{ fromAccountId: caisseId }, { toAccountId: caisseId }],
        },
        include: { fromAccount: true, toAccount: true },
      }),
      prisma.cashSession.findMany({
        select: { openedAt: true, createdAt: true },
      }),
    ]);

  // 6. Détection des dates disponibles pour l'historique
  const getEffectiveDayStr = (d: Date): string => {
    // Si la date a été enregistrée à minuit pile UTC (00:00:00.000Z), elle représente une date calendaire pure (YYYY-MM-DD)
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
      return d.toISOString().slice(0, 10);
    }
    // Sinon, on extrait la date dans le fuseau horaire local d'Algérie (Africa/Algiers)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };

  const dateSet = new Set<string>();
  const addDateToSet = (d: Date) => {
    dateSet.add(getEffectiveDayStr(d));
  };

  salePayments.forEach((p) => {
    addDateToSet(p.paymentDate);
  });
  customerAdvances.forEach((a) => {
    addDateToSet(a.paymentDate);
  });
  allExpenses.forEach((e) => {
    addDateToSet(e.date);
  });
  suppPayments.forEach((p) => {
    addDateToSet(p.paymentDate);
  });
  transfers.forEach((t) => {
    addDateToSet(t.date);
  });
  allSessions.forEach((s) => {
    addDateToSet(s.openedAt);
  });

  const availableDates = Array.from(dateSet).sort().reverse();

  // 7. Filtrage et normalisation des mouvements de la journée sélectionnée
  const matchesDay = (d: Date, sId?: number | null) => {
    return getEffectiveDayStr(d) === targetDayStr;
  };

  const getSortTime = (d: Date, c: Date | null) => {
    const isMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
    if (isMidnight && c) {
      const effDay = getEffectiveDayStr(d);
      const cEffDay = getEffectiveDayStr(c);
      if (cEffDay === effDay) {
        const datePart = new Date(d);
        datePart.setHours(c.getHours(), c.getMinutes(), c.getSeconds(), c.getMilliseconds());
        return datePart.getTime();
      }
      const datePart = new Date(d);
      datePart.setHours(23, 59, 0, 0);
      return datePart.getTime();
    }
    return d.getTime();
  };

  const formatItemDateTime = (d: Date, c: Date | null) => {
    const isMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
    const effDayStr = getEffectiveDayStr(d);
    const [y, m, day] = effDayStr.split("-");
    const dateFormatted = `${day}/${m}/${y}`;

    if (isMidnight && c) {
      const cEffDay = getEffectiveDayStr(c);
      if (cEffDay === effDayStr) {
        const timeStr = c.toLocaleTimeString("fr-DZ", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${dateFormatted} ${timeStr}`;
      }
      return `${dateFormatted} 23:59`;
    }

    if (isMidnight) {
      return `${dateFormatted} 23:59`;
    }

    const timeStr = d.toLocaleTimeString("fr-DZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateFormatted} ${timeStr}`;
  };

  interface JournalRawItem {
    id: string;
    sortTime: number;
    timestamp: string;
    dateFormatted: string;
    reference: string;
    operationType: string;
    operationBadgeClass: string;
    description: string;
    partyName: string;
    inflow: number;
    outflow: number;
    method: string;
    docReference?: string | null;
    source: "sale" | "purchase" | "advance" | "expense" | "income" | "transfer";
    sessionId?: number | null;
  }

  const rawItems: JournalRawItem[] = [];

  // 7.1 Encaissements ventes clients
  for (const p of salePayments) {
    if (matchesDay(p.paymentDate, p.sessionId)) {
      const cust = p.sale?.customer?.name || "Client comptoir";
      rawItems.push({
        id: `pay-sale-${p.id}`,
        sortTime: getSortTime(p.paymentDate, p.createdAt),
        timestamp: (p.createdAt || p.paymentDate).toISOString(),
        dateFormatted: formatItemDateTime(p.paymentDate, p.createdAt),
        reference: p.reference || `PAY-${p.id}`,
        operationType: "Encaissement Vente",
        operationBadgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        description: `Règlement vente ${p.sale?.reference || ""} — ${cust}`,
        partyName: cust,
        inflow: p.amount,
        outflow: 0,
        method: p.method,
        docReference: p.sale?.reference,
        source: "sale",
        sessionId: p.sessionId,
      });
    }
  }

  // 7.2 Acomptes clients reçus en espèces
  for (const a of customerAdvances) {
    if (matchesDay(a.paymentDate, a.sessionId)) {
      rawItems.push({
        id: `adv-${a.id}`,
        sortTime: getSortTime(a.paymentDate, a.createdAt),
        timestamp: (a.createdAt || a.paymentDate).toISOString(),
        dateFormatted: formatItemDateTime(a.paymentDate, a.createdAt),
        reference: a.reference,
        operationType: "Acompte Client",
        operationBadgeClass: "bg-teal-50 text-teal-700 border-teal-200",
        description: `Versement d'acompte client — ${a.customer.name}`,
        partyName: a.customer.name,
        inflow: a.amount,
        outflow: 0,
        method: a.method,
        source: "advance",
        sessionId: a.sessionId,
      });
    }
  }

  // 7.3 Dépenses d'exploitation et recettes manuelles
  for (const e of allExpenses) {
    if (matchesDay(e.date, e.sessionId)) {
      const isInc = e.type === "income";
      const catLower = (e.category || "").toLowerCase();
      let opType = isInc ? "Recette / Apport" : "Dépense d'exploitation";
      let badgeClass = isInc
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200";

      if (!isInc) {
        if (catLower.includes("salaire")) {
          opType = "Paiement Salaire";
          badgeClass = "bg-orange-50 text-orange-700 border-orange-200";
        } else if (catLower.includes("retrait") || catLower.includes("prélèvement")) {
          opType = "Prélèvement Exploitant";
          badgeClass = "bg-rose-50 text-rose-700 border-rose-200";
        }
      }

      rawItems.push({
        id: isInc ? `inc-${e.id}` : `exp-${e.id}`,
        sortTime: getSortTime(e.date, e.createdAt),
        timestamp: (e.createdAt || e.date).toISOString(),
        dateFormatted: formatItemDateTime(e.date, e.createdAt),
        reference: e.reference,
        operationType: opType,
        operationBadgeClass: badgeClass,
        description: e.description,
        partyName: e.beneficiary || (isInc ? "Exploitant / Associé" : "Interne"),
        inflow: isInc ? e.amount : 0,
        outflow: isInc ? 0 : e.amount,
        method: e.method,
        docReference: e.receiptNumber,
        source: isInc ? "income" : "expense",
        sessionId: e.sessionId,
      });
    }
  }

  // 7.4 Règlements fournisseurs décaissés de la caisse
  for (const p of suppPayments) {
    if (matchesDay(p.paymentDate, p.sessionId)) {
      const supp = p.purchase?.supplier?.name || p.supplier?.name || "Fournisseur";
      rawItems.push({
        id: `pay-supp-${p.id}`,
        sortTime: getSortTime(p.paymentDate, p.createdAt),
        timestamp: (p.createdAt || p.paymentDate).toISOString(),
        dateFormatted: formatItemDateTime(p.paymentDate, p.createdAt),
        reference: p.reference || `PAYF-${p.id}`,
        operationType: "Paiement Fournisseur",
        operationBadgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        description: `Règlement fournisseur — ${supp}`,
        partyName: supp,
        inflow: 0,
        outflow: p.amount,
        method: p.method,
        docReference: p.purchase?.reference,
        source: "purchase",
        sessionId: p.sessionId,
      });
    }
  }

  // 7.5 Virements internes touchant la caisse (Entrées ou Sorties)
  for (const t of transfers) {
    if (matchesDay(t.date, t.sessionId)) {
      const isTo = t.toAccountId === caisseId;
      rawItems.push({
        id: isTo ? `trf-in-${t.id}` : `trf-out-${t.id}`,
        sortTime: getSortTime(t.date, t.createdAt),
        timestamp: (t.createdAt || t.date).toISOString(),
        dateFormatted: formatItemDateTime(t.date, t.createdAt),
        reference: t.reference,
        operationType: isTo ? "Transfert Reçu" : "Transfert Émis",
        operationBadgeClass: isTo
          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
          : "bg-purple-50 text-purple-700 border-purple-200",
        description: isTo
          ? `${t.motif} (De : ${t.fromAccount.name})`
          : `${t.motif} (Vers : ${t.toAccount.name})`,
        partyName: isTo ? t.fromAccount.name : t.toAccount.name,
        inflow: isTo ? t.amount : 0,
        outflow: isTo ? 0 : t.amount,
        method: "internal_transfer",
        source: "transfer",
        sessionId: t.sessionId,
      });
    }
  }

  // 8. Tri chronologique strict (le plus ancien en premier)
  rawItems.sort((a, b) => a.sortTime - b.sortTime || a.id.localeCompare(b.id));

  // 9. Calcul du solde courant après chaque opération (Running Balance)
  let run = openingBalance;
  const items: DailyCashJournalItem[] = rawItems.map((item) => {
    run = run + item.inflow - item.outflow;
    return {
      id: item.id,
      timestamp: item.timestamp,
      dateFormatted: item.dateFormatted,
      reference: item.reference,
      operationType: item.operationType,
      operationBadgeClass: item.operationBadgeClass,
      description: item.description,
      partyName: item.partyName,
      inflow: item.inflow,
      outflow: item.outflow,
      runningBalance: Math.round(run * 100) / 100,
      method: item.method,
      docReference: item.docReference,
      source: item.source,
      sessionId: item.sessionId,
    };
  });

  // Séparation stricte des flux d'exploitation et des virements internes de trésorerie
  const operatingInflows = Math.round(
    items.filter((i) => i.source !== "transfer").reduce((s, i) => s + i.inflow, 0) * 100
  ) / 100;
  const operatingOutflows = Math.round(
    items.filter((i) => i.source !== "transfer").reduce((s, i) => s + i.outflow, 0) * 100
  ) / 100;
  const transfersIn = Math.round(
    items.filter((i) => i.source === "transfer").reduce((s, i) => s + i.inflow, 0) * 100
  ) / 100;
  const transfersOut = Math.round(
    items.filter((i) => i.source === "transfer").reduce((s, i) => s + i.outflow, 0) * 100
  ) / 100;

  // Total des entrées et sorties d'exploitation (les transferts internes ne sont pas des charges)
  const totalInflows = operatingInflows;
  const totalOutflows = operatingOutflows;
  const netOperatingFlow = Math.round((operatingInflows - operatingOutflows) * 100) / 100;
  const netTransfers = Math.round((transfersIn - transfersOut) * 100) / 100;

  // Le solde physique final de caisse prend en compte le solde initial, les flux d'exploitation et les transferts de caisse
  const theoreticalFinalBalance = Math.round(
    (openingBalance + operatingInflows - operatingOutflows + transfersIn - transfersOut) * 100
  ) / 100;

  return {
    selectedDate: targetDayStr,
    formattedDate,
    isToday,
    caisseAccount: {
      id: defaultCaisse.id,
      code: defaultCaisse.code,
      name: defaultCaisse.name,
    },
    session: primarySession
      ? {
          id: primarySession.id,
          reference: primarySession.reference,
          status: primarySession.status as "open" | "closed",
          openedAt: primarySession.openedAt.toISOString(),
          closedAt: primarySession.closedAt ? primarySession.closedAt.toISOString() : null,
          openingAmount: primarySession.openingAmount,
          closingAmount: primarySession.closingAmount,
        }
      : null,
    openingBalance,
    totalInflows,
    totalOutflows,
    operatingInflows,
    operatingOutflows,
    transfersIn,
    transfersOut,
    netTransfers,
    netOperatingFlow,
    theoreticalFinalBalance,
    items,
    availableDates,
  };
}
