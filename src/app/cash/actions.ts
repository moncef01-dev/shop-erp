"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ShopSettingsData } from "@/app/settings/actions";
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

    const unlinkedPayments = await prisma.payment.findMany({
      where: {
        sessionId: null,
        method: "cash",
        status: { not: "cancelled" },
      },
      select: { id: true, amount: true },
    });

    const unlinkedExpenses = await prisma.expense.findMany({
      where: {
        sessionId: null,
        method: "cash",
      },
      select: { id: true, amount: true, type: true },
    });

    if (unlinkedPayments.length === 0 && unlinkedExpenses.length === 0) {
      return { success: false, error: "Aucun mouvement en espèces hors session en attente de réconciliation." };
    }

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
          { sessionId: null, paymentDate: { gte: session.openedAt, lte: now } },
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
              { sessionId: null, paymentDate: { gte: session.openedAt, lte: now } },
            ],
          },
        ],
      },
      select: { id: true, amount: true },
    });
    const cashOutPurchases = supplierPayments.reduce((acc, p) => acc + p.amount, 0);

    // 3. Charges et encaissements exceptionnels en espèces
    const expenses = await prisma.expense.findMany({
      where: {
        method: "cash",
        OR: [
          { sessionId: sessionId },
          { sessionId: null, date: { gte: session.openedAt, lte: now } },
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

    const totalCashIn = cashInSales + cashInOther;
    const totalCashOut = cashOutPurchases + cashOutExpenses;
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

      // 2. Lier la session aux paiements et dépenses concernés pour archivage immuable
      const paymentIds = [...salesPayments.map((p) => p.id), ...supplierPayments.map((p) => p.id)];
      if (paymentIds.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: paymentIds } },
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

    const origClosing = session.originalClosingAmount ?? session.closingAmount ?? 0;
    const origTheoretical = session.originalTheoreticalAmount ?? session.theoreticalAmount ?? 0;
    const origDiff = session.originalDifference ?? session.difference ?? 0;

    const theoreticalAmount = session.theoreticalAmount ?? 0;
    const newDifference = newClosingAmount - theoreticalAmount;
    const newRetainedAmount = Math.max(0, newClosingAmount - newTransferAmount);

    const now = new Date();

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
    const date = dateStr ? new Date(dateStr) : new Date();

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
        type: "encaissement",
        source: "sale",
        category: "Vente Meubles",
        description: `Règlement vente ${p.sale?.reference || ""} — ${customerName}`,
        partyName: customerName,
        docReference: p.sale?.reference,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash: (p.method || "cash") === "cash",
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
        type: "decaissement",
        source: "purchase",
        category: "Achat Fournisseur",
        description: `Règlement fournisseur — ${supplierName}`,
        partyName: supplierName,
        docReference: p.purchase?.reference || null,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash: (p.method || "cash") === "cash",
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
        accountId: p.accountId,
        accountName: p.account?.name || null,
      });
    } else {
      // 5.2.1 Paiements directs (ex: acompte ou encaissement direct)
      ledgerItems.push({
        id: `pay-${p.id}`,
        rawId: p.id,
        reference: p.reference || `PAY-${String(p.id).padStart(4, "0")}`,
        date: p.paymentDate.toISOString(),
        type: "encaissement",
        source: "sale",
        category: "Encaissement Caisse",
        description: p.notes || "Encaissement direct en caisse",
        partyName: "Client Comptoir",
        docReference: null,
        method: p.method || "cash",
        amount: p.amount,
        notes: p.notes,
        affectsCash: (p.method || "cash") === "cash",
        sessionId: p.sessionId,
        sessionRef: p.session?.reference,
        accountId: p.accountId,
        accountName: p.account?.name || null,
      });
    }
  }

  // 5.3 Dépenses d'exploitation et encaissements exceptionnels (depuis expenses)
  for (const e of expenses) {
    const isIncome = e.type === "income";
    ledgerItems.push({
      id: isIncome ? `inc-${e.id}` : `exp-${e.id}`,
      rawId: e.id,
      reference: e.reference,
      date: e.date.toISOString(),
      type: isIncome ? "encaissement" : "decaissement",
      source: isIncome ? "income" : "expense",
      category: formatExpenseCategory(e.category),
      description: e.description,
      partyName: e.beneficiary || "Interne Magasin",
      docReference: e.receiptNumber,
      method: e.method || "cash",
      amount: e.amount,
      notes: e.notes,
      affectsCash: (e.method || "cash") === "cash",
      sessionId: e.sessionId,
      sessionRef: e.session?.reference,
    });
  }

  // 5.4 Mouvements de virements internes entre comptes (sans impacter chiffre d'affaires ni charges)
  for (const t of transfers) {
    ledgerItems.push({
      id: `trf-${t.id}`,
      rawId: t.id,
      reference: t.reference,
      date: t.date.toISOString(),
      type: "transfer",
      source: "transfer",
      category: "Virement Interne",
      description: `Transfert ${t.fromAccount.name} → ${t.toAccount.name} (${t.motif})`,
      partyName: `${t.fromAccount.name} → ${t.toAccount.name}`,
      docReference: t.session?.reference || null,
      method: "internal_transfer",
      amount: t.amount,
      notes: t.notes,
      affectsCash: t.fromAccount.type === "cash" || t.toAccount.type === "cash",
      sessionId: t.sessionId,
      sessionRef: t.session?.reference,
      accountId: t.fromAccountId,
      accountName: `${t.fromAccount.name} → ${t.toAccount.name}`,
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
      const t = new Date(item.date).getTime();
      return t >= sessionStart && item.sessionId === null;
    });

    const currentCashIn = sessionCashItems
      .filter((i) => i.type === "encaissement")
      .reduce((acc, i) => acc + i.amount, 0);

    const currentCashOut = sessionCashItems
      .filter((i) => i.type === "decaissement")
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
    if (activeRaw && new Date(item.date).getTime() >= new Date(activeRaw.openedAt).getTime()) return false;
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
        toAccountName: t.toAccount.name,
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
