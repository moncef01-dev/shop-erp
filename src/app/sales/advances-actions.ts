"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { roundMoney } from "@/lib/formatters";

export type AdvanceActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore outside Next request context
  }
}

// ─── RÉFÉRENCE UNIQUE AVANCE : AVA-YYYYMM-XXXX ──────────────────────────────

async function generateNextAdvanceReference(): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `AVA-${yearMonth}-`;

  const lastAdvance = await prisma.customerAdvance.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastAdvance?.reference) {
    const parts = lastAdvance.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── RÉCUPÉRATION DES AVANCES CLIENTS ───────────────────────────────────────

export async function getCustomerAdvancesData() {
  const advances = await prisma.customerAdvance.findMany({
    include: {
      customer: {
        select: { id: true, code: true, name: true, phone: true, phone2: true },
      },
      session: {
        select: { id: true, reference: true, status: true },
      },
      allocations: {
        include: {
          sale: {
            select: { id: true, reference: true, totalAmount: true, paidAmount: true, status: true },
          },
        },
        orderBy: { allocatedAt: "desc" },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  return advances.map((a) => {
    const remainingAmount = roundMoney(
      Math.max(0, a.amount - a.allocatedAmount - a.refundedAmount)
    );
    return {
      ...a,
      remainingAmount,
    };
  });
}

// ─── ENREGISTRER UNE NOUVELLE AVANCE CLIENT ─────────────────────────────────

export async function createCustomerAdvanceAction(data: {
  customerId: number;
  amount: number;
  method: string;
  paymentDate?: string;
  productInterest?: string;
  notes?: string;
}): Promise<AdvanceActionResponse> {
  try {
    const customerId = Number(data.customerId);
    const amount = roundMoney(Number(data.amount));
    const method = data.method || "cash";
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const productInterest = data.productInterest?.trim() || null;
    const notes = data.notes?.trim() || null;

    if (!customerId || isNaN(customerId)) {
      return { success: false, error: "Veuillez sélectionner un client valide." };
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return { success: false, error: "Le montant de l'avance doit être supérieur à 0 DA." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      return { success: false, error: "Client introuvable." };
    }

    // Trouver la session de caisse ouverte si paiement en espèces
    const activeSession = method === "cash"
      ? await prisma.cashSession.findFirst({
          where: { status: "open" },
          select: { id: true },
        })
      : null;

    const reference = await generateNextAdvanceReference();

    const advance = await prisma.$transaction(async (tx) => {
      const created = await tx.customerAdvance.create({
        data: {
          reference,
          customerId,
          amount,
          allocatedAmount: 0,
          refundedAmount: 0,
          method,
          paymentDate,
          productInterest,
          notes,
          status: "available",
          sessionId: activeSession?.id || null,
        },
        include: {
          customer: true,
        },
      });

      // Enregistrer l'encaissement d'avance en trésorerie
      await tx.expense.create({
        data: {
          reference: `ENC-${reference.replace("AVA-", "")}`,
          type: "income",
          category: "misc_income",
          description: `Avance client ${reference} (${customer.name})`,
          amount,
          method,
          beneficiary: customer.name,
          receiptNumber: reference,
          notes: notes ? `Avance client ${reference} : ${notes}` : `Avance client ${reference}`,
          date: paymentDate,
          sessionId: activeSession?.id || null,
        },
      });

      // Mettre à jour la session de caisse si en espèces
      if (activeSession && method === "cash") {
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            totalCashIn: { increment: amount },
          },
        });
      }

      return created;
    });

    safeRevalidate("/sales");
    safeRevalidate("/cash");
    safeRevalidate("/customers");

    return {
      success: true,
      message: `Avance client ${advance.reference} de ${amount.toLocaleString("fr-DZ")} DA enregistrée avec succès.`,
      data: advance,
    };
  } catch (err: unknown) {
    console.error("Erreur création avance client:", err);
    return { success: false, error: "Erreur lors de l'enregistrement de l'avance client." };
  }
}

// ─── AFFECTER UNE AVANCE À UNE FACTURE RÉELLE ──────────────────────────────

export async function allocateCustomerAdvanceAction(data: {
  advanceId: number;
  saleId: number;
  amount: number;
  notes?: string;
}): Promise<AdvanceActionResponse> {
  try {
    const advanceId = Number(data.advanceId);
    const saleId = Number(data.saleId);
    const requestedAmount = roundMoney(Number(data.amount));
    const notes = data.notes?.trim() || null;

    if (!advanceId || !saleId || isNaN(requestedAmount) || requestedAmount <= 0) {
      return { success: false, error: "Paramètres d'affectation invalides." };
    }

    const advance = await prisma.customerAdvance.findUnique({
      where: { id: advanceId },
      include: { customer: true },
    });
    if (!advance) {
      return { success: false, error: "Avance client introuvable." };
    }

    const availableAdvance = roundMoney(
      Math.max(0, advance.amount - advance.allocatedAmount - advance.refundedAmount)
    );
    if (availableAdvance <= 0) {
      return { success: false, error: "Cette avance a déjà été entièrement consommée ou remboursée." };
    }

    const sale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: { customer: true },
    });
    if (!sale) {
      return { success: false, error: "Facture de vente introuvable." };
    }

    if (sale.status === "cancelled") {
      return { success: false, error: "Impossible d'affecter une avance à une facture annulée." };
    }

    // Contrôle d'appartenance client (règle anti-confusion)
    if (sale.customerId && sale.customerId !== advance.customerId) {
      return {
        success: false,
        error: `Cette avance appartient au client "${advance.customer.name}". Elle ne peut pas être affectée à une vente d'un autre client sans transfert explicite.`,
      };
    }

    const remainingDue = roundMoney(Math.max(0, sale.totalAmount - sale.paidAmount));
    if (remainingDue <= 0) {
      return { success: false, error: "Cette facture est déjà intégralement soldée." };
    }

    const maxAllocatable = Math.min(availableAdvance, remainingDue);
    if (requestedAmount > maxAllocatable) {
      return {
        success: false,
        error: `Le montant affecté (${requestedAmount.toLocaleString("fr-DZ")} DA) dépasse le solde disponible ou le reste dû (${maxAllocatable.toLocaleString("fr-DZ")} DA).`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Créer l'enregistrement d'affectation
      await tx.customerAdvanceAllocation.create({
        data: {
          advanceId,
          saleId,
          amount: requestedAmount,
          notes,
        },
      });

      // 2. Mettre à jour l'avance
      const newAllocated = roundMoney(advance.allocatedAmount + requestedAmount);
      const isFullyUsed = (newAllocated + advance.refundedAmount) >= advance.amount;
      await tx.customerAdvance.update({
        where: { id: advanceId },
        data: {
          allocatedAmount: newAllocated,
          status: isFullyUsed ? "fully_used" : "partially_used",
        },
      });

      // 3. Mettre à jour la facture (sans créer de double encaissement en caisse)
      const newPaidAmount = roundMoney(sale.paidAmount + requestedAmount);
      const newPaymentStatus = newPaidAmount >= sale.totalAmount ? "paid" : "partial";
      await tx.sales.update({
        where: { id: saleId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
      });
    });

    safeRevalidate("/sales");
    safeRevalidate("/customers");

    return {
      success: true,
      message: `${requestedAmount.toLocaleString("fr-DZ")} DA de l'avance ${advance.reference} affectés avec succès à la facture ${sale.reference}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur affectation avance:", err);
    return { success: false, error: "Erreur lors de l'affectation de l'avance." };
  }
}

// ─── REMBOURSER UNE AVANCE CLIENT ───────────────────────────────────────────

export async function refundCustomerAdvanceAction(data: {
  advanceId: number;
  amount: number;
  reason: string;
}): Promise<AdvanceActionResponse> {
  try {
    const advanceId = Number(data.advanceId);
    const refundAmount = roundMoney(Number(data.amount));
    const reason = data.reason?.trim();

    if (!advanceId || isNaN(refundAmount) || refundAmount <= 0) {
      return { success: false, error: "Montant de remboursement invalide." };
    }

    if (!reason || reason.length < 3) {
      return { success: false, error: "Veuillez préciser le motif du remboursement." };
    }

    const advance = await prisma.customerAdvance.findUnique({
      where: { id: advanceId },
      include: { customer: true },
    });
    if (!advance) {
      return { success: false, error: "Avance introuvable." };
    }

    const maxRefundable = roundMoney(
      Math.max(0, advance.amount - advance.allocatedAmount - advance.refundedAmount)
    );
    if (refundAmount > maxRefundable) {
      return {
        success: false,
        error: `Le montant à rembourser (${refundAmount.toLocaleString("fr-DZ")} DA) dépasse le solde remboursable restant (${maxRefundable.toLocaleString("fr-DZ")} DA).`,
      };
    }

    // Caisse session si remboursement en espèces
    const activeSession = advance.method === "cash"
      ? await prisma.cashSession.findFirst({
          where: { status: "open" },
          select: { id: true },
        })
      : null;

    await prisma.$transaction(async (tx) => {
      const newRefunded = roundMoney(advance.refundedAmount + refundAmount);
      const isFullyCompleted = (advance.allocatedAmount + newRefunded) >= advance.amount;
      const newStatus = isFullyCompleted
        ? (advance.allocatedAmount === 0 ? "refunded" : "fully_used")
        : "partially_used";

      await tx.customerAdvance.update({
        where: { id: advanceId },
        data: {
          refundedAmount: newRefunded,
          status: newStatus,
          notes: advance.notes
            ? `${advance.notes} | Remboursement de ${refundAmount} DA le ${new Date().toLocaleDateString("fr-DZ")} : ${reason}`
            : `Remboursement de ${refundAmount} DA : ${reason}`,
        },
      });

      // Mouvement de trésorerie de sortie
      await tx.expense.create({
        data: {
          reference: `RMB-${Date.now().toString().slice(-6)}`,
          type: "expense",
          category: "other",
          description: `Remboursement avance client ${advance.reference} (${advance.customer.name}) : ${reason}`,
          amount: refundAmount,
          method: advance.method,
          beneficiary: advance.customer.name,
          sessionId: activeSession?.id || null,
        },
      });

      if (activeSession && advance.method === "cash") {
        await tx.cashSession.update({
          where: { id: activeSession.id },
          data: {
            totalCashOut: { increment: refundAmount },
          },
        });
      }
    });

    safeRevalidate("/sales");
    safeRevalidate("/cash");
    safeRevalidate("/customers");

    return {
      success: true,
      message: `Remboursement de ${refundAmount.toLocaleString("fr-DZ")} DA enregistré pour l'avance ${advance.reference}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur remboursement avance:", err);
    return { success: false, error: "Erreur lors du remboursement de l'avance." };
  }
}
