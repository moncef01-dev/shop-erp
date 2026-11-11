/**
 * Historical Customer Trust Funds (Savings & Advances Held) Reconstruction Engine
 * Reconstructs customer balances (épargne et acomptes) held in business vaults as of cutoff date T.
 *
 * Shariah Rule: Customer funds are trusts/liabilities (أمانات), NOT business assets.
 * They are tracked to prevent confusing customer money with shop capital.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ZakatCustomerFundsSummary, SubsystemStatus } from "./types";
import { isEffectiveOnOrBefore, roundMoney } from "./date-utils";

export interface ReconstructCustomerFundsOptions {
  valuationDateStr: string;
  db?: PrismaClient;
}

export async function reconstructHistoricalCustomerFunds(
  options: ReconstructCustomerFundsOptions
): Promise<ZakatCustomerFundsSummary> {
  const { valuationDateStr, db = defaultPrisma } = options;

  // 1. Reconstruction de l'épargne client historique à partir des transactions datées
  // INTERDICTION d'utiliser CustomerSavingsAccount.balance directement (solde courant)
  let savingsTransactions: Array<{
    id: number;
    accountId: number;
    customerId: number;
    type: string;
    direction: string;
    amount: number;
    date: Date;
    createdAt: Date;
  }> = [];

  const warnings: string[] = [];

  try {
    savingsTransactions = await db.customerSavingsTransaction.findMany({
      where: {
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        accountId: true,
        customerId: true,
        type: true,
        direction: true,
        amount: true,
        date: true,
        createdAt: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      warnings.push("Table customer_savings_transactions non initialisée. Épargne client ignorée.");
    } else {
      throw err;
    }
  }

  // Agréger le solde historique par compte d'épargne
  const savingsBalanceByAccount = new Map<number, number>();

  for (const tx of savingsTransactions) {
    const txDate = tx.date || tx.createdAt;
    if (!isEffectiveOnOrBefore(txDate, valuationDateStr)) continue;

    const currentBal = savingsBalanceByAccount.get(tx.accountId) ?? 0;
    let delta = 0;

    if (tx.type === "DEPOSIT" || tx.type === "REVERSAL" || tx.direction === "IN") {
      delta = tx.amount;
    } else if (tx.type === "USAGE" || tx.type === "REFUND" || tx.direction === "OUT") {
      delta = -tx.amount;
    }

    savingsBalanceByAccount.set(tx.accountId, currentBal + delta);
  }

  let totalSavingsHeld = 0;
  let activeSavingsAccountsCount = 0;

  for (const bal of savingsBalanceByAccount.values()) {
    const rounded = roundMoney(Math.max(0, bal));
    if (rounded > 0) {
      activeSavingsAccountsCount++;
      totalSavingsHeld = roundMoney(totalSavingsHeld + rounded);
    }
  }

  // 2. Reconstruction des acomptes clients non encore consommés à la date T
  const advances = await db.customerAdvance.findMany({
    where: {
      status: { not: "cancelled" },
    },
    select: {
      id: true,
      customerId: true,
      amount: true,
      paymentDate: true,
      createdAt: true,
      allocations: {
        select: {
          id: true,
          amount: true,
          allocatedAt: true,
        },
      },
    },
  });

  let totalUnallocatedAdvances = 0;
  let unallocatedAdvancesCount = 0;

  for (const adv of advances) {
    const advDate = adv.paymentDate || adv.createdAt;
    if (!isEffectiveOnOrBefore(advDate, valuationDateStr)) continue;

    let allocatedBeforeT = 0;
    for (const alloc of adv.allocations) {
      if (isEffectiveOnOrBefore(alloc.allocatedAt, valuationDateStr)) {
        allocatedBeforeT += alloc.amount;
      }
    }

    const unallocated = roundMoney(Math.max(0, adv.amount - allocatedBeforeT));
    if (unallocated > 0) {
      unallocatedAdvancesCount++;
      totalUnallocatedAdvances = roundMoney(totalUnallocatedAdvances + unallocated);
    }
  }

  const totalCustomerFunds = roundMoney(totalSavingsHeld + totalUnallocatedAdvances);

  const note =
    "Fonds clients sous gestion (Amanat) : Les soldes d'épargne client et les acomptes non consommés représentent des fonds appartenant aux clients, bien que physiquement logés dans la caisse ou le coffre du magasin. Ces sommes ne constituent pas des actifs de l'entreprise et ne doivent pas être taxées au titre de la Zakat commerciale.";

  const reconstructionStatus: SubsystemStatus =
    totalCustomerFunds > 0 ? "REQUIRES_REVIEW" : "VERIFIED";

  return {
    reconstructionStatus,
    totalSavingsHeldDZD: totalSavingsHeld,
    totalUnallocatedAdvancesDZD: totalUnallocatedAdvances,
    totalCustomerFundsDZD: totalCustomerFunds,
    savingsAccountsCount: activeSavingsAccountsCount,
    unallocatedAdvancesCount,
    note,
    warnings,
  };
}
