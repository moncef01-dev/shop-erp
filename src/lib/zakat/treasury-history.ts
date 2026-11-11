/**
 * Historical Treasury Reconstruction Engine for Zakat Accounting
 * Reconstructs accurate balances of all treasury accounts (Cash, Safes, Banks)
 * as of historical cutoff date T.
 * Adheres strictly to Africa/Algiers timezone and double-counting prevention.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ZakatTreasurySummary,
  ZakatTreasuryAccountItem,
  SubsystemStatus,
} from "./types";
import {
  isEffectiveOnOrBefore,
  roundMoney,
} from "./date-utils";

export interface ReconstructTreasuryOptions {
  valuationDateStr: string;
  db?: PrismaClient;
}

export async function reconstructHistoricalTreasury(
  options: ReconstructTreasuryOptions
): Promise<ZakatTreasurySummary> {
  const { valuationDateStr, db = defaultPrisma } = options;

  // 1. Récupération de tous les comptes de trésorerie
  const accounts = await db.treasuryAccount.findMany({
    orderBy: [{ isDefault: "desc" }, { type: "asc" }, { name: "asc" }],
  });

  const defaultAccount = accounts.find((a) => a.isDefault || a.type === "cash") || accounts[0];

  // 2. Récupération de l'ensemble des flux de trésorerie
  let allSupplierAdditionalPayments: Array<{
    id: number;
    reference: string;
    treasuryAccountId: number;
    amount: number;
    isReversal: boolean;
    status: string;
    date: Date;
    createdAt: Date;
  }> = [];

  const [
    allTransfers,
    allPayments,
    allAdvances,
    allExpenses,
  ] = await Promise.all([
    db.treasuryTransfer.findMany({
      select: {
        id: true,
        reference: true,
        fromAccountId: true,
        toAccountId: true,
        amount: true,
        date: true,
        createdAt: true,
      },
    }),
    db.payment.findMany({
      where: {
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        reference: true,
        accountId: true,
        amount: true,
        method: true,
        purchaseId: true,
        supplierId: true,
        paymentDate: true,
        createdAt: true,
      },
    }),
    db.customerAdvance.findMany({
      where: {
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        reference: true,
        accountId: true,
        amount: true,
        method: true,
        paymentDate: true,
        createdAt: true,
      },
    }),
    db.expense.findMany({
      where: {
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        reference: true,
        accountId: true,
        amount: true,
        type: true,
        method: true,
        date: true,
        createdAt: true,
      },
    }),
  ]);

  try {
    allSupplierAdditionalPayments = await db.supplierAdditionalPayment.findMany({
      select: {
        id: true,
        reference: true,
        treasuryAccountId: true,
        amount: true,
        isReversal: true,
        status: true,
        date: true,
        createdAt: true,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("no such table")) throw err;
  }

  const accountItems: ZakatTreasuryAccountItem[] = [];
  const warnings: string[] = [];

  let totalTreasuryFunds = 0;
  let totalTransfersInGlobal = 0;
  let totalTransfersOutGlobal = 0;

  for (const acc of accounts) {
    const accId = acc.id;
    const isDef = acc.id === defaultAccount?.id;

    let balance = acc.openingBalance;
    let totalInflows = 0;
    let totalOutflows = 0;
    let transfersIn = 0;
    let transfersOut = 0;

    // A. Virements internes (TreasuryTransfer)
    for (const t of allTransfers) {
      const txDate = t.date || t.createdAt;
      if (!isEffectiveOnOrBefore(txDate, valuationDateStr)) continue;

      if (t.toAccountId === accId) {
        transfersIn += t.amount;
        totalInflows += t.amount;
        totalTransfersInGlobal += t.amount;
      }
      if (t.fromAccountId === accId) {
        transfersOut += t.amount;
        totalOutflows += t.amount;
        totalTransfersOutGlobal += t.amount;
      }
    }

    // B. Encaissements ventes et règlements clients (Payment)
    for (const p of allPayments) {
      const txDate = p.paymentDate || p.createdAt;
      if (!isEffectiveOnOrBefore(txDate, valuationDateStr)) continue;

      // Exclure les paiements par épargne (qui ne constituent pas de flux de trésorerie physique)
      if (p.method?.toLowerCase() === "savings") continue;

      const isForThisAccount =
        p.accountId === accId ||
        (isDef && p.accountId === null && p.method?.toLowerCase() === "cash");

      if (!isForThisAccount) continue;

      const isPurchaseOrSupplier = p.purchaseId !== null || p.supplierId !== null;

      if (!isPurchaseOrSupplier) {
        // Encaissement vente client (+)
        totalInflows += p.amount;
      } else {
        // Décaissement paiement fournisseur (-)
        totalOutflows += p.amount;
      }
    }

    // C. Acomptes clients reçus (CustomerAdvance)
    for (const adv of allAdvances) {
      const txDate = adv.paymentDate || adv.createdAt;
      if (!isEffectiveOnOrBefore(txDate, valuationDateStr)) continue;

      const isForThisAccount =
        adv.accountId === accId ||
        (isDef && adv.accountId === null && adv.method?.toLowerCase() === "cash");

      if (isForThisAccount) {
        totalInflows += adv.amount;
      }
    }

    // D. Dépenses d'exploitation et produits exceptionnels (Expense)
    for (const exp of allExpenses) {
      const txDate = exp.date || exp.createdAt;
      if (!isEffectiveOnOrBefore(txDate, valuationDateStr)) continue;

      const isForThisAccount =
        exp.accountId === accId ||
        (isDef && exp.accountId === null && exp.method?.toLowerCase() === "cash") ||
        (acc.code === "ACC-BANQUE" && exp.accountId === null && exp.method?.toLowerCase() === "transfer");

      if (!isForThisAccount) continue;

      if (exp.type === "income") {
        totalInflows += exp.amount;
      } else {
        totalOutflows += exp.amount;
      }
    }

    // E. Versements supplémentaires fournisseurs (SupplierAdditionalPayment)
    for (const sap of allSupplierAdditionalPayments) {
      const txDate = sap.date || sap.createdAt;
      if (!isEffectiveOnOrBefore(txDate, valuationDateStr)) continue;

      if (sap.treasuryAccountId !== accId) continue;

      if (!sap.isReversal) {
        // Versement d'argent au fournisseur : décaissement (-)
        totalOutflows += sap.amount;
      } else if (sap.status === "completed") {
        // Contrepassation / restitution de fonds : ré-encaissement (+)
        totalInflows += sap.amount;
      }
    }

    balance = roundMoney(balance + totalInflows - totalOutflows);
    const hasNegativeBalance = balance < 0;

    if (hasNegativeBalance) {
      warnings.push(
        `Solde négatif détecté pour le compte "${acc.name}" (${acc.code}) à la date du ${valuationDateStr} : ${balance.toLocaleString("fr-DZ")} DA. Une anomalie de saisie ou un découvert physique doit être investigué.`
      );
    }

    totalTreasuryFunds = roundMoney(totalTreasuryFunds + balance);

    accountItems.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type as "cash" | "safe" | "bank" | "other",
      isDefault: acc.isDefault,
      openingBalance: roundMoney(acc.openingBalance),
      inflows: roundMoney(totalInflows),
      outflows: roundMoney(totalOutflows),
      transfersIn: roundMoney(transfersIn),
      transfersOut: roundMoney(transfersOut),
      reconstructedBalance: balance,
      hasNegativeBalance,
    });
  }

  // Vérification de la stricte neutralité des virements internes (conservation de la masse monétaire)
  const transfersNet = roundMoney(totalTransfersInGlobal - totalTransfersOutGlobal);
  const isTransfersNetZero = Math.abs(transfersNet) < 0.01;

  if (!isTransfersNetZero) {
    warnings.push(
      `Anomalie critique de virements internes : Total virements entrants (${totalTransfersInGlobal}) ≠ Total virements sortants (${totalTransfersOutGlobal}). Écart net: ${transfersNet} DA.`
    );
  }

  let reconstructionStatus: SubsystemStatus = "VERIFIED";
  if (!isTransfersNetZero) {
    reconstructionStatus = "INCOMPLETE";
  } else if (accountItems.some((a) => a.hasNegativeBalance)) {
    reconstructionStatus = "REQUIRES_REVIEW";
  }

  return {
    reconstructionStatus,
    totalBalanceDZD: roundMoney(totalTreasuryFunds),
    activeAccountsCount: accounts.length,
    interAccountTransfersNet: transfersNet,
    isTransfersNetZero,
    accounts: accountItems,
    warnings,
  };
}
