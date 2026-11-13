"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import type { ShopSettingsData } from "@/app/settings/actions";
import { assertPeriodNotLocked, assertDatesNotLocked } from "@/server/services/period-lock";
import {
  findDailyCaisseAccount,
  findDailyCaisseAccountLenient,
  findDailyCaisseAccountWithInactive,
  findTreasuryAccountById,
  findDefaultTreasuryAccountRaw,
  findBankAccountRaw,
  createDefaultCashAccount,
  findCashSessionById,
  findCashSessionWithTransfers,
  findLastClosedSession,
  findSessionsWithTransfers,
  findSessionsOfDay,
  findAllSessionsLite,
  findPriorClosedSessionBefore,
  createCashSessionRecord,
  updateCashSessionRecord,
  findPendingCashPayments,
  findPendingCashExpenses,
  findUnlinkedCashPayments,
  findUnlinkedCashExpenses,
  attachPendingCashToSession,
  attachPaymentsToSession,
  attachAdvancesToSession,
  attachExpensesToSession,
  attachTransfersToSession,
  findSessionWindowCashSales,
  findSessionWindowCashSupplierPayments,
  findSessionWindowCashAdvances,
  findSessionWindowCashExpenses,
  findSessionWindowTransfers,
  findExpenseWithSession,
  createExpenseEntry,
  cancelExpenseRecord,
  findLedgerPayments,
  findLedgerExpenses,
  findLedgerTransfers,
  findLedgerAdvances,
  findSuppAdditionalPaymentsWithLedger,
  findSuppAdditionalPaymentsForAccount,
  findShopSettingsById,
  findOpeningBalanceAggregates,
  fetchDailyCashFlux,
  findTreasuryTransferById,
  createTreasuryTransferRecord,
  updateTreasuryTransferRecord,
  deleteTreasuryTransferRecord,
  generateNextExpenseReference,
  generateNextCashSessionReference,
  findOpenCashSession,
} from "@/server/repositories/cash.repository";
import {
  generateNextTreasuryTransferReference,
  getTreasuryDashboardData,
  createTreasuryAccountAction as createTreasuryAccountActionImpl,
  createTreasuryTransferAction as createTreasuryTransferActionImpl,
  getAccountMovements as getAccountMovementsImpl,
  type TreasuryDashboardSummary,
} from "./treasury-actions";
import { calculateAccountBalance } from "@/server/repositories/cash.repository";

export async function createTreasuryAccountAction(
  ...args: Parameters<typeof createTreasuryAccountActionImpl>
) {
  return createTreasuryAccountActionImpl(...args);
}

export async function createTreasuryTransferAction(
  ...args: Parameters<typeof createTreasuryTransferActionImpl>
) {
  return createTreasuryTransferActionImpl(...args);
}

export async function getAccountMovements(
  ...args: Parameters<typeof getAccountMovementsImpl>
) {
  return getAccountMovementsImpl(...args);
}

export type {
  TreasuryAccountData,
  TreasuryTransferData,
  AccountMovementItem,
} from "./treasury-actions";

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

    const defaultCaisse = await findDailyCaisseAccount();
    const caisseId = defaultCaisse?.id;

    if (includePendingCash) {
      const lastClosedSession = await findLastClosedSession();
      const cutoff = lastClosedSession?.closedAt ?? new Date(0);

      const [pendingPayments, pendingExpenses] = await Promise.all([
        findPendingCashPayments(cutoff, caisseId),
        findPendingCashExpenses(cutoff, caisseId),
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
    const existingActive = await findOpenCashSession();

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
      const created = await createCashSessionRecord(tx, {
        reference,
        status: "open",
        openingAmount,
        openedAt,
        openingNotes,
      });

      if (includePendingCash) {
        const lastClosedSession = await findLastClosedSession(undefined, tx);
        const cutoff = lastClosedSession?.closedAt ?? new Date(0);

        await attachPendingCashToSession(tx, created.id, caisseId, cutoff);
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
    const session = await findCashSessionById(sessionId);
    if (!session) return { success: false, error: "Session de caisse introuvable." };
    if (session.status !== "open") {
      return { success: false, error: "Les encaissements ne peuvent être rattachés qu'à une session de caisse ouverte." };
    }

    const defaultCaisse = await findDailyCaisseAccount();
    const caisseId = defaultCaisse?.id;

    const lastClosedSession = await findLastClosedSession({ before: session.openedAt });
    const cutoff = lastClosedSession?.closedAt ?? new Date(0);

    const unlinkedPayments = await findUnlinkedCashPayments(cutoff, caisseId);
    const unlinkedExpenses = await findUnlinkedCashExpenses(cutoff, caisseId);

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
      await attachPaymentsToSession(tx, paymentIds, session.id);
      await attachExpensesToSession(tx, expenseIds, session.id);
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

    const session = await findCashSessionById(sessionId);

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

    const defaultCaisse = await findDailyCaisseAccount();
    const caisseId = session.accountId || defaultCaisse?.id;

    const lastClosedBefore = await findLastClosedSession({ before: session.openedAt });
    const cutoff = lastClosedBefore?.closedAt ?? session.openedAt;

    // Calcul autoritaire côté serveur sur la fenêtre [openedAt, now] et les opérations rattachées
    // 1. Encaissements physiques (Ventes et encaissements en espèces)
    const salesPayments = await findSessionWindowCashSales(sessionId, caisseId, cutoff, now);
    const cashInSales = salesPayments.reduce((acc, p) => acc + p.amount, 0);

    // 2. Décaissements physiques (Fournisseurs en espèces)
    const supplierPayments = await findSessionWindowCashSupplierPayments(sessionId, caisseId, cutoff, now);
    const cashOutPurchases = supplierPayments.reduce((acc, p) => acc + p.amount, 0);

    // 3. Acomptes clients reçus en espèces
    const customerAdvances = await findSessionWindowCashAdvances(sessionId, caisseId, cutoff, now);
    const cashInAdvances = customerAdvances.reduce((acc, a) => acc + a.amount, 0);

    // 4. Charges et encaissements exceptionnels en espèces
    const expenses = await findSessionWindowCashExpenses(sessionId, caisseId, cutoff, now);
    const cashOutExpenses = expenses
      .filter((e) => e.type === "expense")
      .reduce((acc, e) => acc + e.amount, 0);
    const cashInOther = expenses
      .filter((e) => e.type === "income")
      .reduce((acc, e) => acc + e.amount, 0);

    // 5. Transferts internes affectant la caisse pendant la session
    const transfersIn = caisseId
      ? await findSessionWindowTransfers(sessionId, caisseId, cutoff, now, "in")
      : [];
    const cashInTransfers = transfersIn.reduce((acc, t) => acc + t.amount, 0);

    const transfersOut = caisseId
      ? await findSessionWindowTransfers(sessionId, caisseId, cutoff, now, "out")
      : [];
    const cashOutTransfers = transfersOut.reduce((acc, t) => acc + t.amount, 0);

    const totalCashIn = cashInSales + cashInAdvances + cashInOther + cashInTransfers;
    const totalCashOut = cashOutPurchases + cashOutExpenses + cashOutTransfers;
    const theoreticalAmount = session.openingAmount + totalCashIn - totalCashOut;
    const difference = closingAmount - theoreticalAmount;

    // Mise à jour atomique de clôture & transfert optionnel
    const { updatedSession, transferInfo } = await prisma.$transaction(async (tx) => {
      // 1. Clôturer la session
      const updated = await updateCashSessionRecord(tx, sessionId, {
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
      });

      // 2. Lier la session aux paiements, dépenses, acomptes et transferts concernés
      const paymentIds = [...salesPayments.map((p) => p.id), ...supplierPayments.map((p) => p.id)];
      await attachPaymentsToSession(tx, paymentIds, sessionId);

      const advanceIds = customerAdvances.map((a) => a.id);
      await attachAdvancesToSession(tx, advanceIds, sessionId);

      const expenseIds = expenses.map((e) => e.id);
      await attachExpensesToSession(tx, expenseIds, sessionId);

      const transferIds = [...transfersIn.map((t) => t.id), ...transfersOut.map((t) => t.id)];
      await attachTransfersToSession(tx, transferIds, sessionId);

      // 3. Enregistrer le transfert de clôture si un montant a été spécifié par l'utilisateur
      let transferResult: { reference: string; destName: string } | null = null;
      if (transferAmount > 0 && transferDestinationAccountId) {
        let sourceAccount = await findDailyCaisseAccountLenient(tx);
        if (!sourceAccount) {
          sourceAccount = await createDefaultCashAccount(tx, {
            code: "ACC-CAISSE",
            name: "Caisse journalière",
            type: "cash",
            openingBalance: 0,
            isDefault: true,
            isActive: true,
          });
        }

        if (sourceAccount.id === transferDestinationAccountId) {
          throw new Error("Le compte de destination du transfert doit être différent de la caisse journalière.");
        }

        const destAccount = await findTreasuryAccountById(transferDestinationAccountId, tx);
        if (!destAccount || !destAccount.isActive) {
          throw new Error("Compte de destination du transfert introuvable ou inactif.");
        }

        const trfRef = await generateNextTreasuryTransferReference(tx);
        await createTreasuryTransferRecord(tx, {
          reference: trfRef,
          fromAccountId: sourceAccount.id,
          toAccountId: destAccount.id,
          amount: transferAmount,
          motif: transferNotes?.trim() || `Transfert clôture de caisse ${session.reference}`,
          date: now,
          sessionId: sessionId,
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

    const session = await findCashSessionWithTransfers(sessionId);

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
      await updateCashSessionRecord(tx, sessionId, {
        closingAmount: newClosingAmount,
        difference: newDifference,
        retainedAmount: newRetainedAmount,
        originalClosingAmount: origClosing,
        originalTheoreticalAmount: origTheoretical,
        originalDifference: origDiff,
        closingNotes: newClosingNotes || session.closingNotes,
        closingEditAudit: JSON.stringify(existingAudit),
      });

      // 2. Réconciliation sans doublon avec le virement existant
      const existingTransfer = session.transfers[0];
      const targetDestAccountId = newTransferDestinationAccountId || existingTransfer?.toAccountId;

      if (newTransferAmount > 0 && targetDestAccountId) {
        if (existingTransfer) {
          await updateTreasuryTransferRecord(tx, existingTransfer.id, {
            amount: newTransferAmount,
            toAccountId: targetDestAccountId,
            motif: `Correction clôture de caisse ${session.reference} (${reason})`,
          });
        } else {
          const defaultCashAcc = await findDailyCaisseAccountLenient(tx);

          if (defaultCashAcc) {
            const trfRef = await generateNextTreasuryTransferReference(tx);
            await createTreasuryTransferRecord(tx, {
              reference: trfRef,
              fromAccountId: defaultCashAcc.id,
              toAccountId: targetDestAccountId,
              amount: newTransferAmount,
              motif: `Transfert correction clôture ${session.reference}`,
              date: now,
              sessionId: sessionId,
            });
          }
        }
      } else if (newTransferAmount === 0 && existingTransfer) {
        await deleteTreasuryTransferRecord(tx, existingTransfer.id);
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
    let selectedAccount: { id: number; name: string; type: string; isDefault: boolean; isActive: boolean } | null = null;
    if (accountId) {
      const acc = await findTreasuryAccountById(accountId);
      if (!acc) return { success: false, error: "Compte de trésorerie sélectionné introuvable." };
      if (!acc.isActive) return { success: false, error: `Le compte "${acc.name}" est inactif.` };
      selectedAccount = acc;
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
        const def = await findDefaultTreasuryAccountRaw();
        if (def) {
          accountId = def.id;
          selectedAccount = def;
        }
      } else if (method === "transfer") {
        const defBank = await findBankAccountRaw();
        if (defBank) {
          accountId = defBank.id;
          selectedAccount = defBank;
        }
      }
    }

    // Si règlement en espèces affectant la caisse journalière, rattacher automatiquement à la session ouverte s'il y en a une
    // Règle stricte : Le Coffre magasin et les autres comptes ne doivent JAMAIS recevoir de sessionId de caisse
    let sessionId: number | null = null;
    if (method === "cash") {
      const isDailyCash = selectedAccount
        ? (selectedAccount.isDefault || selectedAccount.type === "cash")
        : true;

      if (isDailyCash) {
        const activeSession = await findOpenCashSession();
        if (activeSession) {
          sessionId = activeSession.id;
        }
      }
    }

    const reference = await generateNextExpenseReference(type === "income" ? "income" : "expense");

    const expense = await createExpenseEntry({
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

export async function deleteExpenseAction(
  expenseId: number,
  reasonArg?: string,
  cancelledByArg?: string
): Promise<CashActionResponse> {
  return cancelExpenseAction({
    expenseId,
    reason: reasonArg || "Annulation / suppression de la pièce de dépense",
    cancelledBy: cancelledByArg || "Administration ERP",
  });
}

export async function cancelExpenseAction(payload: {
  expenseId: number;
  reason: string;
  cancelledBy?: string;
}): Promise<CashActionResponse> {
  try {
    const expense = await findExpenseWithSession(payload.expenseId);

    if (!expense) {
      return { success: false, error: "Pièce de dépense ou ajustement introuvable." };
    }

    if (expense.status === "cancelled") {
      return { success: false, error: `La pièce ${expense.reference} est déjà annulée.` };
    }

    if (expense.session && expense.session.status === "closed") {
      return {
        success: false,
        error: "Impossible d'annuler une pièce rattachée à une session de caisse déjà clôturée.",
      };
    }

    await assertPeriodNotLocked(expense.date, "Annulation de dépense / encaissement");

    const reason = payload.reason?.trim() || "Annulation manuelle";
    const cancelledBy = payload.cancelledBy?.trim() || "Administration ERP";
    const now = new Date();

    const auditEntry = `[ANNULATION AUDITÉE le ${now.toISOString()} par ${cancelledBy} : ${reason}]`;
    const updatedNotes = expense.notes ? `${expense.notes} ${auditEntry}` : auditEntry;

    await cancelExpenseRecord(payload.expenseId, {
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: reason,
      cancelledBy: cancelledBy,
      notes: updatedNotes,
    });

    safeRevalidate("/cash");
    safeRevalidate("/sales");
    safeRevalidate("/reports");

    return {
      success: true,
      message: `La pièce ${expense.reference} (${expense.amount.toLocaleString("fr-DZ")} DA) a été annulée avec succès (Audit trail préservé).`,
      data: {
        reference: expense.reference,
        amount: expense.amount,
        status: "cancelled",
        cancelledAt: now.toISOString(),
        cancellationReason: reason,
        cancelledBy,
      },
    };
  } catch (err: unknown) {
    console.error("Erreur annulation dépense / ajustement:", err);
    return {
      success: false,
      error: "Erreur lors de l'annulation de la pièce.",
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
  source: "sale" | "purchase" | "expense" | "income" | "transfer" | "supplier_additional_payment";
  category: string;
  rawCategory?: string;
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
  status?: string;
  supplierId?: number | null;
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

function formatExpenseCategory(cat: string, type: "expense" | "income" = "expense"): string {
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
      return type === "income"
        ? "Apport personnel exploitant"
        : "Fonds Propres / Prélèvement";
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
  const sessions = await findSessionsWithTransfers();

  const activeRaw = sessions.find((s) => s.status === "open") || null;

  // 2. Récupérer l'ensemble des paiements existants (Clients & Fournisseurs) non annulés
  const payments = await findLedgerPayments();

  // 3. Récupérer l'ensemble des dépenses et mouvements manuels non annulés
  const expenses = await findLedgerExpenses();

  // 4. Récupérer l'ensemble des transferts de trésorerie
  const transfers = await findLedgerTransfers();

  // 4.1 Récupérer l'ensemble des acomptes clients non annulés
  const advances = await findLedgerAdvances();

  const defaultCashAcc = await findDailyCaisseAccount();
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
        status: p.status,
        supplierId: p.supplierId || p.purchase?.supplierId || null,
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
        status: p.status,
        supplierId: p.supplierId || p.purchase?.supplierId || null,
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
        status: p.status,
        supplierId: p.supplierId || p.purchase?.supplierId || null,
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
    const expType = isIncome ? "income" : "expense";
    ledgerItems.push({
      id: isIncome ? `inc-${e.id}` : `exp-${e.id}`,
      rawId: e.id,
      reference: e.reference,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      type: isIncome ? "encaissement" : "decaissement",
      source: isIncome ? "income" : "expense",
      category: formatExpenseCategory(e.category, expType),
      rawCategory: e.category,
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
      status: e.status,
    });
  }

  // 5.5 Versements supplémentaires fournisseur
  try {
    const suppAddPayments = await findSuppAdditionalPaymentsWithLedger();

    for (const ap of suppAddPayments) {
      const isFromCash =
        ap.treasuryAccountId === defaultCashAccId ||
        ap.treasuryAccount.type === "cash" ||
        ap.treasuryAccount.isDefault;
      const isReversal = ap.isReversal;

      ledgerItems.push({
        id: `supp-add-${ap.id}`,
        rawId: ap.id,
        reference: ap.reference,
        date: ap.date.toISOString(),
        createdAt: ap.createdAt.toISOString(),
        type: isReversal ? "encaissement" : "decaissement",
        source: "supplier_additional_payment",
        category: isReversal ? "Annulation Versement" : "Versement Fournisseur",
        description:
          ap.description ||
          (isReversal
            ? `Contrepassation versement ${ap.reversalOf?.reference || ""} — ${ap.supplier.name}`
            : `Versement supplémentaire fournisseur — ${ap.supplier.name}`),
        partyName: ap.supplier.name,
        docReference: ap.reversalOf?.reference || null,
        method: ap.paymentMethod,
        amount: ap.amount,
        notes: ap.notes,
        affectsCash: isFromCash,
        sessionId: ap.sessionId,
        sessionRef: ap.session?.reference,
        accountId: ap.treasuryAccountId,
        accountName: ap.treasuryAccount.name,
        status: ap.status,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no such table")) throw err;
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
  const lastClosedSession = sessions.find((s) => s.status === "closed" && s.closedAt);
  const lastClosedAtTime = lastClosedSession?.closedAt ? new Date(lastClosedSession.closedAt).getTime() : 0;

  const pendingCashItems = ledgerItems.filter((item) => {
    if (!item.affectsCash) return false;
    if (item.type === "transfer") return false; // les transferts ne sont pas des espèces en attente
    if (item.sessionId !== null) return false;
    const t = new Date(item.date).getTime();
    const tCreated = item.createdAt ? new Date(item.createdAt).getTime() : 0;
    if (t <= lastClosedAtTime && tCreated <= lastClosedAtTime) return false;
    if (activeRaw) {
      const sessionStart = new Date(activeRaw.openedAt).getTime();
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
  const settings = await findShopSettingsById();

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
  source: "sale" | "purchase" | "advance" | "expense" | "income" | "transfer" | "supplier_additional_payment";
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
  const defaultCaisse = await findDailyCaisseAccountWithInactive();

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
  const sessionsOnDay = await findSessionsOfDay(
    new Date(`${targetDayStr}T00:00:00.000Z`),
    new Date(`${targetDayStr}T23:59:59.999Z`)
  );

  const sessionIdsForDay = new Set(sessionsOnDay.map((s) => s.id));
  const firstSessionOfDay = sessionsOnDay[0] || null;
  const primarySession = sessionsOnDay.length > 0 ? sessionsOnDay[sessionsOnDay.length - 1] : null;

  // 4. Détermination rigoureuse du solde initial du jour
  let openingBalance = 0;
  if (firstSessionOfDay) {
    openingBalance = firstSessionOfDay.openingAmount;
  } else {
    // Si aucune session n'a été ouverte ce jour, chercher la dernière session clôturée antérieure
    const priorClosedSession = await findPriorClosedSessionBefore(new Date(`${targetDayStr}T00:00:00.000Z`));

    if (priorClosedSession && priorClosedSession.closedAt) {
      let bal = priorClosedSession.retainedAmount ?? priorClosedSession.closingAmount ?? 0;
      const cutoff = priorClosedSession.closedAt;
      const dayStart = new Date(`${targetDayStr}T00:00:00.000Z`);

      const [trIn, trOut, pIn, advIn, incIn, suppOut, expOut] = await findOpeningBalanceAggregates(
        caisseId,
        cutoff,
        dayStart
      );

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
    await fetchDailyCashFlux(caisseId);

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

  // Mappage rigoureux de chaque session vers sa journée de reporting effective (fuseau horaire local)
  const sessionDayMap = new Map<number, string>();
  allSessions.forEach((s) => {
    addDateToSet(s.openedAt);
    if (s.createdAt) addDateToSet(s.createdAt);
    const effDay = getEffectiveDayStr(s.openedAt);
    sessionDayMap.set(s.id, effDay);
    if (effDay === targetDayStr) {
      sessionIdsForDay.add(s.id);
    }
  });

  salePayments.forEach((p) => {
    if (p.sessionId && sessionDayMap.has(p.sessionId)) {
      dateSet.add(sessionDayMap.get(p.sessionId)!);
    } else {
      addDateToSet(p.paymentDate);
      if (p.createdAt) addDateToSet(p.createdAt);
    }
  });
  customerAdvances.forEach((a) => {
    if (a.sessionId && sessionDayMap.has(a.sessionId)) {
      dateSet.add(sessionDayMap.get(a.sessionId)!);
    } else {
      addDateToSet(a.paymentDate);
      if (a.createdAt) addDateToSet(a.createdAt);
    }
  });
  allExpenses.forEach((e) => {
    if (e.sessionId && sessionDayMap.has(e.sessionId)) {
      dateSet.add(sessionDayMap.get(e.sessionId)!);
    } else {
      addDateToSet(e.date);
      if (e.createdAt) addDateToSet(e.createdAt);
    }
  });
  suppPayments.forEach((p) => {
    if (p.sessionId && sessionDayMap.has(p.sessionId)) {
      dateSet.add(sessionDayMap.get(p.sessionId)!);
    } else {
      addDateToSet(p.paymentDate);
      if (p.createdAt) addDateToSet(p.createdAt);
    }
  });
  transfers.forEach((t) => {
    if (t.sessionId && sessionDayMap.has(t.sessionId)) {
      dateSet.add(sessionDayMap.get(t.sessionId)!);
    } else {
      addDateToSet(t.date);
      if (t.createdAt) addDateToSet(t.createdAt);
    }
  });

  // 7. Filtrage et normalisation des mouvements de la journée sélectionnée
  const matchesDay = (d: Date, sId?: number | null, c?: Date | null) => {
    // Règle 1 : Si l'opération est explicitement rattachée à une session de caisse,
    // elle appartient au journal de la journée de sa session (convention session-based)
    if (sId && sessionDayMap.has(sId)) {
      return sessionDayMap.get(sId) === targetDayStr;
    }
    // Règle 2 : Opérations hors-session (sans session) attribuées selon la date calendaire
    if (getEffectiveDayStr(d) === targetDayStr) return true;
    if (c && getEffectiveDayStr(c) === targetDayStr) return true;
    return false;
  };

  const getSortTime = (d: Date, c: Date | null, isClosingTransfer = false) => {
    if (isClosingTransfer && c) {
      return Math.max(d.getTime(), c.getTime(), 1);
    }
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
    source: "sale" | "purchase" | "advance" | "expense" | "income" | "transfer" | "supplier_additional_payment";
    sessionId?: number | null;
  }

  const rawItems: JournalRawItem[] = [];

  // 7.1 Encaissements ventes clients
  for (const p of salePayments) {
    if (matchesDay(p.paymentDate, p.sessionId, p.createdAt)) {
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
    if (matchesDay(a.paymentDate, a.sessionId, a.createdAt)) {
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
    if (matchesDay(e.date, e.sessionId, e.createdAt)) {
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
        } else if (
          catLower.includes("retrait") ||
          catLower.includes("prélèvement") ||
          catLower === "capital"
        ) {
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
    if (matchesDay(p.paymentDate, p.sessionId, p.createdAt)) {
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

  // 7.6 Versements supplémentaires fournisseurs
  try {
    const dailySuppAdd = await findSuppAdditionalPaymentsForAccount(caisseId);

    for (const ap of dailySuppAdd) {
      if (ap.sessionId && sessionDayMap.has(ap.sessionId)) {
        dateSet.add(sessionDayMap.get(ap.sessionId)!);
      } else {
        addDateToSet(ap.date);
        if (ap.createdAt) addDateToSet(ap.createdAt);
      }

      if (matchesDay(ap.date, ap.sessionId, ap.createdAt)) {
        const isRev = ap.isReversal;
        rawItems.push({
          id: `supp-add-${ap.id}`,
          sortTime: getSortTime(ap.date, ap.createdAt),
          timestamp: (ap.createdAt || ap.date).toISOString(),
          dateFormatted: formatItemDateTime(ap.date, ap.createdAt),
          reference: ap.reference,
          operationType: isRev ? "Annulation Versement Fournisseur" : "Versement Supplémentaire Fournisseur",
          operationBadgeClass: isRev
            ? "bg-purple-50 text-purple-700 border-purple-200"
            : "bg-indigo-50 text-indigo-700 border-indigo-200",
          description: ap.description || `Versement fournisseur ${ap.supplier.name}`,
          partyName: ap.supplier.name,
          inflow: isRev ? ap.amount : 0,
          outflow: isRev ? 0 : ap.amount,
          method: ap.paymentMethod,
          docReference: ap.reversalOf?.reference || null,
          source: "supplier_additional_payment",
          sessionId: ap.sessionId,
        });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no such table")) throw err;
  }

  // 7.5 Virements internes touchant la caisse (Entrées ou Sorties)
  for (const t of transfers) {
    if (matchesDay(t.date, t.sessionId, t.createdAt)) {
      const isTo = t.toAccountId === caisseId;
      const isClosing =
        (t.motif || "").toLowerCase().includes("clôture") ||
        (t.motif || "").toLowerCase().includes("cloture");
      rawItems.push({
        id: isTo ? `trf-in-${t.id}` : `trf-out-${t.id}`,
        sortTime: getSortTime(t.date, t.createdAt, isClosing),
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

  const availableDates = Array.from(dateSet).sort().reverse();

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
