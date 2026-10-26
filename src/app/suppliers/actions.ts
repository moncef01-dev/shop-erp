"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/inventory-transaction";
import { calculateAccountBalance } from "@/app/cash/treasury-actions";
import { assertPeriodNotLocked } from "@/lib/period-lock";

export interface SupplierStatementEvent {
  id: string;
  date: string;
  reference: string;
  type: "INITIAL_DEBT" | "PURCHASE_INVOICE" | "PAYMENT" | "ADJUSTMENT" | "RETURN";
  typeLabel: string;
  description: string;
  debit: number; // Montant diminuant la dette envers le fournisseur (Paiement / Règlement / Retour)
  credit: number; // Montant augmentant la dette envers le fournisseur (Achat, dette initiale)
  runningBalance: number; // Solde restant dû après l'opération (précédent + Crédit - Débit)
  accountName?: string | null;
  method?: string | null;
  notes?: string | null;
}

export interface SupplierDetailsWithBalance {
  id: number;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  initialDebt: number;
  totalPurchases: number;
  totalPaid: number;
  totalReturns?: number;
  outstandingDebt: number;
  purchasesCount: number;
  paymentsCount: number;
  lastPaymentDate: string | null;
  lastPurchaseDate: string | null;
}

export interface SupplierStatementData {
  supplier: SupplierDetailsWithBalance;
  events: SupplierStatementEvent[];
  summary: {
    initialDebt: number;
    totalPurchases: number;
    totalInvoiced: number;
    totalPaid: number;
    totalReturns?: number;
    outstandingDebt: number;
  };
}

function safeRevalidate() {
  try {
    revalidatePath("/suppliers");
    revalidatePath("/purchases");
    revalidatePath("/cash");
  } catch {
    // Ignore in scripts/tests
  }
}

// ─── GÉNÉRATEURS DE RÉFÉRENCES ────────────────────────────────────────────────

export async function generateNextSupplierDebtReference(
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `DET-${yearMonth}-`;

  const last = await db.supplierDebt.findFirst({
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

export async function generateNextSupplierPaymentRef(
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PAYF-${yearMonth}-`;

  const last = await db.payment.findFirst({
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

export async function generateNextSupplierReturnReference(
  txClient?: PrismaTransactionClient
): Promise<string> {
  const db = txClient || prisma;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `RET-${yearMonth}-`;

  const last = await db.supplierDebt.findFirst({
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

// ─── CALCUL DU SOLDE D'UN FOURNISSEUR ──────────────────────────────────────────

export async function calculateSupplierDebt(
  supplierId: number,
  txClient?: PrismaTransactionClient
): Promise<{
  initialDebt: number;
  totalPurchases: number;
  totalPaid: number;
  totalReturns: number;
  outstandingDebt: number;
}> {
  const db = txClient || prisma;

  // 1. Dettes initiales / antérieures (hors retours)
  const debtsAgg = await db.supplierDebt.aggregate({
    where: { supplierId, type: { notIn: ["supplier_return", "return"] } },
    _sum: { amount: true },
  });
  const initialDebt = debtsAgg._sum.amount ?? 0;

  // 2. Retours marchandises / Avoirs (déduits de la dette)
  const returnsAgg = await db.supplierDebt.aggregate({
    where: { supplierId, type: { in: ["supplier_return", "return"] } },
    _sum: { amount: true },
  });
  const totalReturns = returnsAgg._sum.amount ?? 0;

  // 3. Achats confirmés dans le système
  const purchasesAgg = await db.purchase.aggregate({
    where: {
      supplierId,
      status: { not: "cancelled" },
    },
    _sum: { totalAmount: true },
  });
  const totalPurchases = purchasesAgg._sum.totalAmount ?? 0;

  // 4. Paiements effectués au fournisseur
  const paymentsAgg = await db.payment.aggregate({
    where: {
      status: { not: "cancelled" },
      OR: [
        { supplierId },
        { purchase: { supplierId } },
      ],
    },
    _sum: { amount: true },
  });
  const totalPaid = paymentsAgg._sum.amount ?? 0;

  const outstandingDebt = Math.max(0, initialDebt + totalPurchases - totalPaid - totalReturns);

  return {
    initialDebt: Math.round(initialDebt * 100) / 100,
    totalPurchases: Math.round(totalPurchases * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalReturns: Math.round(totalReturns * 100) / 100,
    outstandingDebt: Math.round(outstandingDebt * 100) / 100,
  };
}

// ─── ENREGISTRER UNE DETTE INITIALE ────────────────────────────────────────────

export type RecordSupplierInitialDebtInput = {
  supplierId: number;
  amount: number;
  description?: string;
  notes?: string;
  reference?: string;
  date?: string;
  debtDate?: string;
};

export async function recordSupplierInitialDebtAction(
  payload: FormData | RecordSupplierInitialDebtInput
) {
  try {
    let supplierId: number;
    let amount: number;
    let description: string;
    let notes: string | null = null;
    let dateStr: string | undefined;
    let reference: string | undefined;

    if (payload instanceof FormData) {
      supplierId = parseInt(payload.get("supplierId") as string, 10);
      amount = parseFloat((payload.get("amount") as string)?.replace(/\s/g, ""));
      description = ((payload.get("description") as string)?.trim() || (payload.get("notes") as string)?.trim() || "Dette initiale antérieure");
      notes = (payload.get("notes") as string)?.trim() || null;
      dateStr = (payload.get("date") as string) || (payload.get("debtDate") as string) || undefined;
      reference = (payload.get("reference") as string)?.trim() || undefined;
    } else {
      supplierId = Number(payload.supplierId);
      amount = Number(payload.amount);
      description = (payload.description || payload.notes || "Dette initiale antérieure")?.trim();
      notes = payload.notes?.trim() || null;
      dateStr = payload.debtDate || payload.date;
      reference = payload.reference?.trim() || undefined;
    }

    const date = dateStr ? new Date(dateStr) : new Date();

    await assertPeriodNotLocked(date, "Enregistrement dette initiale fournisseur");

    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: "Le montant de la dette initiale doit être un nombre strictement supérieur à 0 DA.",
      };
    }

    if (!description || description.length < 3) {
      return {
        success: false,
        error: "La description / motif de la dette est obligatoire (au moins 3 caractères).",
      };
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) {
      return { success: false, error: "Fournisseur introuvable." };
    }

    // Protection anti-doublon strict (même fournisseur, même montant, même description)
    const existing = await prisma.supplierDebt.findFirst({
      where: {
        supplierId,
        amount,
        description,
      },
    });
    if (existing) {
      return {
        success: false,
        error: `Une dette initiale identique (${amount.toLocaleString(
          "fr-DZ"
        )} DA — "${description}") est déjà enregistrée pour ce fournisseur.`,
      };
    }

    // Protection anti-double soumission rapide (15 secondes)
    const recent = await prisma.supplierDebt.findFirst({
      where: {
        supplierId,
        amount,
        createdAt: { gte: new Date(Date.now() - 15000) },
      },
    });
    if (recent) {
      return {
        success: false,
        error: `Une dette identique (${amount.toLocaleString(
          "fr-DZ"
        )} DA) vient d'être enregistrée il y a quelques secondes.`,
      };
    }

    // Protection anti-doublon référence explicite
    if (reference && reference.trim()) {
      const existingByRef = await prisma.supplierDebt.findUnique({
        where: { reference: reference.trim() },
      });
      if (existingByRef) {
        return {
          success: false,
          error: `Une dette avec la référence "${reference.trim()}" existe déjà.`,
        };
      }
    }

    const finalReference = reference && reference.trim() ? reference.trim() : await generateNextSupplierDebtReference();

    const createdDebt = await prisma.supplierDebt.create({
      data: {
        reference: finalReference,
        supplierId,
        amount,
        type: "initial_debt",
        description,
        notes,
        date,
      },
    });

    safeRevalidate();

    const newBalances = await calculateSupplierDebt(supplierId);

    return {
      success: true,
      message: `Dette initiale ${reference} de ${amount.toLocaleString(
        "fr-DZ"
      )} DA enregistrée pour ${supplier.name}. Dette totale : ${newBalances.outstandingDebt.toLocaleString(
        "fr-DZ"
      )} DA.`,
      data: createdDebt,
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement dette initiale fournisseur:", err);
    return {
      success: false,
      error: "Erreur lors de l'enregistrement de la dette fournisseur.",
    };
  }
}

// ─── ENREGISTRER UN RETOUR MARCHANDISE FOURNISSEUR ───────────────────────────

export type SupplierReturnInput = {
  supplierId: number;
  amount: number;
  date?: string;
  notes?: string | null;
};

export async function recordSupplierReturnAction(
  payload: FormData | SupplierReturnInput
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    id: number;
    reference: string;
    supplierId: number;
    supplierName: string;
    amount: number;
    date: string;
    resultingDebt: number;
  };
}> {
  try {
    let supplierId: number;
    let amount: number;
    let dateStr: string | undefined;
    let notes: string | null = null;

    if (payload instanceof FormData) {
      supplierId = parseInt(payload.get("supplierId") as string, 10);
      const amountRaw = payload.get("amount") as string;
      amount = parseFloat(amountRaw?.replace(/\s/g, "") || "");
      dateStr = (payload.get("date") as string) || (payload.get("returnDate") as string) || undefined;
      notes = (payload.get("notes") as string)?.trim() || null;
    } else {
      supplierId = Number(payload.supplierId);
      amount = Number(payload.amount);
      dateStr = payload.date;
      notes = payload.notes?.trim() || null;
    }

    if (!supplierId || isNaN(supplierId)) {
      return { success: false, error: "Veuillez désigner le fournisseur concerné." };
    }

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant du retour doit être un nombre strictement supérieur à 0 DA." };
    }

    const returnEffectiveDate = dateStr ? new Date(dateStr) : new Date();
    await assertPeriodNotLocked(returnEffectiveDate, "Enregistrement retour marchandise fournisseur");

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) {
      return { success: false, error: "Fournisseur introuvable." };
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Vérification stricte de la dette actuelle
      const debtInfo = await calculateSupplierDebt(supplier.id, tx);
      if (debtInfo.outstandingDebt <= 0) {
        throw new Error(
          `Le fournisseur "${supplier.name}" n'a aucune dette en cours. Impossible d'enregistrer un retour déductif.`
        );
      }

      if (amount > debtInfo.outstandingDebt) {
        throw new Error(
          `Le montant du retour (${amount.toLocaleString(
            "fr-DZ"
          )} DA) ne peut pas dépasser la dette restante du fournisseur (${debtInfo.outstandingDebt.toLocaleString(
            "fr-DZ"
          )} DA).`
        );
      }

      // 2. Protection anti-double soumission rapide (15s)
      const recentDup = await tx.supplierDebt.findFirst({
        where: {
          supplierId: supplier.id,
          type: "supplier_return",
          amount,
          createdAt: { gte: new Date(Date.now() - 15000) },
        },
      });
      if (recentDup) {
        throw new Error(
          `Un retour identique (${amount.toLocaleString(
            "fr-DZ"
          )} DA) a déjà été validé il y a quelques secondes.`
        );
      }

      // 3. Génération de référence unique
      const reference = await generateNextSupplierReturnReference(tx);
      const date = dateStr ? new Date(dateStr) : new Date();

      const debtRecord = await tx.supplierDebt.create({
        data: {
          reference,
          supplierId: supplier.id,
          amount,
          type: "supplier_return",
          description: notes ? `Retour marchandise — ${notes}` : `Retour marchandise (Avoir fournisseur)`,
          notes,
          date,
        },
      });

      // 4. Calcul de la dette résultante vérifiée
      const updatedDebtInfo = await calculateSupplierDebt(supplier.id, tx);
      const resultingDebt = updatedDebtInfo.outstandingDebt;

      return {
        id: debtRecord.id,
        reference,
        supplierId: supplier.id,
        supplierName: supplier.name,
        amount,
        date: date.toISOString(),
        resultingDebt,
      };
    });

    safeRevalidate();

    return {
      success: true,
      message: `Retour marchandise de ${result.amount.toLocaleString(
        "fr-DZ"
      )} DA validé (Réf: ${result.reference}). Dette restante : ${result.resultingDebt.toLocaleString(
        "fr-DZ"
      )} DA.`,
      data: result,
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement retour fournisseur:", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Erreur lors de l'enregistrement du retour fournisseur.";
    return { success: false, error: msg };
  }
}

// ─── RÈGLEMENT MULTI-COMPTES DE TRÉSORERIE ─────────────────────────────────────

export type SupplierPaymentMultiAccountInput = {
  supplierId?: number;
  purchaseId?: number;
  amount: number;
  sourceAccountId: number | string;
  method?: string;
  paymentMethod?: string;
  paymentDate?: string;
  notes?: string | null;
};

export async function recordSupplierPaymentMultiAccountAction(
  input: FormData | SupplierPaymentMultiAccountInput
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}> {
  try {
    let supplierIdStr: string | undefined;
    let purchaseIdStr: string | undefined;
    let amountStr: string | undefined;
    let sourceAccountIdStr: string | undefined;
    let method = "cash";
    let paymentDateStr: string | undefined;
    let notes: string | null = null;

    if (input instanceof FormData) {
      supplierIdStr = (input.get("supplierId") as string) || undefined;
      purchaseIdStr = (input.get("purchaseId") as string) || undefined;
      amountStr = (input.get("amount") as string) || undefined;
      sourceAccountIdStr = (input.get("sourceAccountId") as string) || undefined;
      method = (input.get("method") as string) || "cash";
      paymentDateStr = (input.get("paymentDate") as string) || undefined;
      notes = ((input.get("notes") as string)?.trim()) || null;
    } else {
      supplierIdStr = input.supplierId !== undefined ? String(input.supplierId) : undefined;
      purchaseIdStr = input.purchaseId !== undefined ? String(input.purchaseId) : undefined;
      amountStr = input.amount !== undefined ? String(input.amount) : undefined;
      sourceAccountIdStr = input.sourceAccountId !== undefined ? String(input.sourceAccountId) : undefined;
      method = input.method || input.paymentMethod || "cash";
      paymentDateStr = input.paymentDate;
      notes = input.notes?.trim() || null;
    }

    if (!supplierIdStr && !purchaseIdStr) {
      return { success: false, error: "Veuillez désigner le fournisseur ou la commande à régler." };
    }

    if (!amountStr) {
      return { success: false, error: "Le montant du paiement est obligatoire." };
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant du paiement doit être un nombre strictement supérieur à 0 DA." };
    }

    if (!sourceAccountIdStr) {
      return { success: false, error: "Veuillez sélectionner le compte de trésorerie débité (source)." };
    }

    // Si Retours est sélectionné, déléguer vers l'action dédiée de retour marchandise
    const normalizedSource = sourceAccountIdStr.trim().toLowerCase();
    if (normalizedSource === "retours" || normalizedSource === "returns") {
      const targetSuppId = supplierIdStr ? parseInt(supplierIdStr, 10) : 0;
      return await recordSupplierReturnAction({
        supplierId: targetSuppId,
        amount,
        date: paymentDateStr,
        notes,
      });
    }

    const targetEffectiveDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
    await assertPeriodNotLocked(targetEffectiveDate, "Règlement fournisseur multi-comptes");

    const sourceAccountId = parseInt(sourceAccountIdStr, 10);
    const purchaseId = purchaseIdStr ? parseInt(purchaseIdStr, 10) : null;

    let targetSupplierId = supplierIdStr ? parseInt(supplierIdStr, 10) : 0;

    if (purchaseId) {
      const p = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        select: { supplierId: true, totalAmount: true, paidAmount: true, status: true },
      });
      if (!p) return { success: false, error: "Commande fournisseur introuvable." };
      if (p.status === "cancelled") return { success: false, error: "Impossible de payer une commande annulée." };
      if (p.supplierId) targetSupplierId = p.supplierId;
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: targetSupplierId },
    });
    if (!supplier) return { success: false, error: "Fournisseur introuvable." };

    // Transaction atomique avec vérification stricte du solde compte et de la dette
    const result = await prisma.$transaction(async (tx) => {
      // 1. Vérification du compte de trésorerie
      const sourceAccount = await tx.treasuryAccount.findUnique({
        where: { id: sourceAccountId },
      });
      if (!sourceAccount) throw new Error("Compte de trésorerie source introuvable.");
      if (!sourceAccount.isActive) throw new Error(`Le compte "${sourceAccount.name}" est inactif.`);

      const availableAccountFunds = await calculateAccountBalance(sourceAccountId, tx);
      if (availableAccountFunds < amount) {
        throw new Error(
          `Fonds insuffisants sur le compte "${sourceAccount.name}". Solde disponible : ${availableAccountFunds.toLocaleString(
            "fr-DZ"
          )} DA, paiement requis : ${amount.toLocaleString("fr-DZ")} DA.`
        );
      }

      // 2. Vérification de la dette du fournisseur (anti trop-perçu)
      const debtInfo = await calculateSupplierDebt(supplier.id, tx);
      if (amount > debtInfo.outstandingDebt) {
        throw new Error(
          `Le montant du règlement (${amount.toLocaleString(
            "fr-DZ"
          )} DA) dépasse la dette totale du fournisseur (${debtInfo.outstandingDebt.toLocaleString(
            "fr-DZ"
          )} DA). Les trop-perçus ne sont pas autorisés.`
        );
      }

      // Protection anti-double soumission rapide (15 secondes)
      const recentDup = await tx.payment.findFirst({
        where: {
          supplierId: supplier.id,
          accountId: sourceAccountId,
          amount,
          status: { not: "cancelled" },
          createdAt: { gte: new Date(Date.now() - 15000) },
        },
      });
      if (recentDup) {
        throw new Error(
          `Un règlement identique (${amount.toLocaleString(
            "fr-DZ"
          )} DA) vient d'être validé il y a quelques secondes.`
        );
      }

      // 3. Rattachement éventuel à la session de caisse si Caisse Journalière
      let sessionId: number | null = null;
      if (sourceAccount.type === "cash" && method === "cash") {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: "open" },
        });
        if (activeSession) {
          sessionId = activeSession.id;
        }
      }

      const reference = await generateNextSupplierPaymentRef(tx);
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();

      const payment = await tx.payment.create({
        data: {
          reference,
          purchaseId: purchaseId || null,
          supplierId: supplier.id,
          accountId: sourceAccountId,
          amount,
          method,
          status: "completed",
          notes: notes || `Règlement fournisseur ${supplier.name} depuis ${sourceAccount.name}`,
          paymentDate,
          sessionId,
        },
      });

      // 4. Si lié à une commande spécifique, mise à jour du paidAmount de la commande
      if (purchaseId) {
        const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
        if (purchase) {
          const newPaid = purchase.paidAmount + amount;
          const paymentStatus = newPaid >= purchase.totalAmount ? "paid" : "partial";
          await tx.purchase.update({
            where: { id: purchaseId },
            data: {
              paidAmount: newPaid,
              paymentStatus,
            },
          });
        }
      } else {
        // Paiement global : ventiler sur les commandes d'achat non soldées (ordre chronologique)
        let unallocated = amount;
        const unpaidPurchases = await tx.purchase.findMany({
          where: {
            supplierId: supplier.id,
            status: { not: "cancelled" },
            paymentStatus: { not: "paid" },
          },
          orderBy: { purchaseDate: "asc" },
        });

        for (const p of unpaidPurchases) {
          if (unallocated <= 0) break;
          const due = p.totalAmount - p.paidAmount;
          const apply = Math.min(unallocated, due);
          const newPaid = p.paidAmount + apply;
          const newStatus = newPaid >= p.totalAmount ? "paid" : "partial";
          await tx.purchase.update({
            where: { id: p.id },
            data: {
              paidAmount: newPaid,
              paymentStatus: newStatus,
            },
          });
          unallocated -= apply;
        }
      }

      return { payment, sourceAccount };
    });

    safeRevalidate();

    const remaining = await calculateSupplierDebt(supplier.id);

    return {
      success: true,
      message: `Règlement ${result.payment.reference} de ${amount.toLocaleString(
        "fr-DZ"
      )} DA validé depuis "${result.sourceAccount.name}". Reste dû à ${supplier.name} : ${remaining.outstandingDebt.toLocaleString(
        "fr-DZ"
      )} DA.`,
      data: result.payment,
    };
  } catch (err: unknown) {
    console.error("Erreur enregistrement règlement fournisseur:", err);
    const msg = err instanceof Error ? err.message : "Erreur lors du règlement fournisseur.";
    return { success: false, error: msg };
  }
}

// ─── RELEVÉ DE COMPTE FOURNISSEUR (AUXILIARY LEDGER) ──────────────────────────

export async function getSupplierStatement(
  supplierId: number,
  filters?: { startDate?: string; endDate?: string }
): Promise<SupplierStatementData | null> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) return null;

  const events: SupplierStatementEvent[] = [];

  // 1. Dettes initiales
  // 1. Dettes et Retours
  const debts = await prisma.supplierDebt.findMany({
    where: { supplierId },
    orderBy: { date: "asc" },
  });
  for (const d of debts) {
    const isReturn = d.type === "supplier_return" || d.type === "return";
    if (isReturn) {
      events.push({
        id: `return-${d.id}`,
        date: d.date.toISOString(),
        reference: d.reference,
        type: "RETURN",
        typeLabel: "Retour Marchandise / Avoir",
        description: d.description || `Retour marchandise (${d.reference})`,
        debit: d.amount,
        credit: 0,
        runningBalance: 0,
        notes: d.notes,
      });
    } else {
      events.push({
        id: `debt-${d.id}`,
        date: d.date.toISOString(),
        reference: d.reference,
        type: "INITIAL_DEBT",
        typeLabel: "Dette Antérieure / Initiale",
        description: d.description,
        debit: 0,
        credit: d.amount,
        runningBalance: 0,
        notes: d.notes,
      });
    }
  }

  // 2. Factures achats
  const purchases = await prisma.purchase.findMany({
    where: {
      supplierId,
      status: { not: "cancelled" },
    },
    orderBy: { purchaseDate: "asc" },
  });
  for (const p of purchases) {
    events.push({
      id: `pur-${p.id}`,
      date: p.purchaseDate.toISOString(),
      reference: p.reference,
      type: "PURCHASE_INVOICE",
      typeLabel: "Bon de Commande / Achat",
      description: `Achat ${p.reference}${p.notes ? ` — ${p.notes}` : ""}`,
      debit: 0,
      credit: p.totalAmount,
      runningBalance: 0,
      notes: p.notes,
    });
  }

  // 3. Règlements
  const payments = await prisma.payment.findMany({
    where: {
      status: { not: "cancelled" },
      OR: [
        { supplierId },
        { purchase: { supplierId } },
      ],
    },
    include: {
      account: { select: { name: true } },
      purchase: { select: { reference: true } },
    },
    orderBy: { paymentDate: "asc" },
  });
  for (const pay of payments) {
    events.push({
      id: `pay-${pay.id}`,
      date: pay.paymentDate.toISOString(),
      reference: pay.reference || `PAYF-${pay.id}`,
      type: "PAYMENT",
      typeLabel: "Règlement Fournisseur",
      description: pay.purchase
        ? `Règlement achat ${pay.purchase.reference}`
        : (pay.notes || "Règlement sur compte fournisseur"),
      debit: pay.amount,
      credit: 0,
      runningBalance: 0,
      accountName: pay.account?.name || (pay.method === "cash" ? "Caisse journalière" : "Compte bancaire"),
      method: pay.method,
      notes: pay.notes,
    });
  }

  // Tri chronologique croissant pour calcul de la balance courante
  // Priorité le même jour : 1 = Dette antérieure, 2 = Achat, 3 = Retour, 4 = Paiement
  const typeAscPriority: Record<string, number> = {
    INITIAL_DEBT: 1,
    PURCHASE_INVOICE: 2,
    RETURN: 3,
    PAYMENT: 4,
    ADJUSTMENT: 5,
  };

  events.sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    return (typeAscPriority[a.type] || 5) - (typeAscPriority[b.type] || 5);
  });

  let running = 0;
  for (const ev of events) {
    running = running + ev.credit - ev.debit;
    ev.runningBalance = Math.round(running * 100) / 100;
  }

  // Filtrage par date si demandé
  let filtered = events;
  if (filters?.startDate) {
    const s = new Date(filters.startDate).setHours(0, 0, 0, 0);
    filtered = filtered.filter((ev) => new Date(ev.date).getTime() >= s);
  }
  if (filters?.endDate) {
    const e = new Date(filters.endDate).setHours(23, 59, 59, 999);
    filtered = filtered.filter((ev) => new Date(ev.date).getTime() <= e);
  }

  // Tri décroissant pour affichage standard (plus récent en premier)
  const typeDescPriority: Record<string, number> = {
    PAYMENT: 1,
    RETURN: 2,
    PURCHASE_INVOICE: 3,
    INITIAL_DEBT: 4,
    ADJUSTMENT: 5,
  };

  filtered.sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tB - tA;
    return (typeDescPriority[a.type] || 5) - (typeDescPriority[b.type] || 5);
  });

  const initialDebts = debts.filter((d) => d.type !== "supplier_return" && d.type !== "return");
  const returnDebts = debts.filter((d) => d.type === "supplier_return" || d.type === "return");

  const debtsTotal = initialDebts.reduce((sum, d) => sum + d.amount, 0);
  const returnsTotal = returnDebts.reduce((sum, d) => sum + d.amount, 0);
  const purchasesTotal = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstandingDebt = Math.max(0, debtsTotal + purchasesTotal - paymentsTotal - returnsTotal);

  const lastPay = payments.length > 0 ? payments[payments.length - 1].paymentDate.toISOString() : null;
  const lastPur = purchases.length > 0 ? purchases[purchases.length - 1].purchaseDate.toISOString() : null;

  return {
    supplier: {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
      isActive: supplier.isActive,
      initialDebt: debtsTotal,
      totalPurchases: purchasesTotal,
      totalPaid: paymentsTotal,
      totalReturns: returnsTotal,
      outstandingDebt,
      purchasesCount: purchases.length,
      paymentsCount: payments.length,
      lastPaymentDate: lastPay,
      lastPurchaseDate: lastPur,
    },
    events: filtered,
    summary: {
      initialDebt: debtsTotal,
      totalPurchases: purchasesTotal,
      totalReturns: returnsTotal,
      totalInvoiced: debtsTotal + purchasesTotal,
      totalPaid: paymentsTotal,
      outstandingDebt,
    },
  };
}

// ─── LISTE GLOBALE DES FOURNISSEURS AVEC DETTES ───────────────────────────────

export async function getAllSuppliersWithDebts(searchQuery?: string): Promise<{
  suppliers: SupplierDetailsWithBalance[];
  metrics: {
    totalSuppliersCount: number;
    activeSuppliersCount: number;
    totalOutstandingDebt: number;
    totalPurchasesAmount: number;
    totalPaidAmount: number;
  };
}> {
  const query = searchQuery?.trim();
  const whereClause = query
    ? {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
          { code: { contains: query } },
          { address: { contains: query } },
        ],
      }
    : {};

  const suppliers = await prisma.supplier.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
  });

  const list: SupplierDetailsWithBalance[] = [];
  let totalOutstandingDebt = 0;
  let totalPurchasesAmount = 0;
  let totalPaidAmount = 0;

  for (const s of suppliers) {
    const debtInfo = await calculateSupplierDebt(s.id);
    const purchasesCount = await prisma.purchase.count({
      where: { supplierId: s.id, status: { not: "cancelled" } },
    });
    const paymentsCount = await prisma.payment.count({
      where: {
        status: { not: "cancelled" },
        OR: [{ supplierId: s.id }, { purchase: { supplierId: s.id } }],
      },
    });

    const lastPayment = await prisma.payment.findFirst({
      where: {
        status: { not: "cancelled" },
        OR: [{ supplierId: s.id }, { purchase: { supplierId: s.id } }],
      },
      orderBy: { paymentDate: "desc" },
      select: { paymentDate: true },
    });

    const lastPurchase = await prisma.purchase.findFirst({
      where: { supplierId: s.id, status: { not: "cancelled" } },
      orderBy: { purchaseDate: "desc" },
      select: { purchaseDate: true },
    });

    totalOutstandingDebt += debtInfo.outstandingDebt;
    totalPurchasesAmount += debtInfo.totalPurchases;
    totalPaidAmount += debtInfo.totalPaid;

    list.push({
      id: s.id,
      code: s.code,
      name: s.name,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes,
      isActive: s.isActive,
      initialDebt: debtInfo.initialDebt,
      totalPurchases: debtInfo.totalPurchases,
      totalPaid: debtInfo.totalPaid,
      outstandingDebt: debtInfo.outstandingDebt,
      purchasesCount,
      paymentsCount,
      lastPaymentDate: lastPayment ? lastPayment.paymentDate.toISOString() : null,
      lastPurchaseDate: lastPurchase ? lastPurchase.purchaseDate.toISOString() : null,
    });
  }

  return {
    suppliers: list,
    metrics: {
      totalSuppliersCount: suppliers.length,
      activeSuppliersCount: suppliers.filter((s) => s.isActive).length,
      totalOutstandingDebt: Math.round(totalOutstandingDebt * 100) / 100,
      totalPurchasesAmount: Math.round(totalPurchasesAmount * 100) / 100,
      totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
    },
  };
}
