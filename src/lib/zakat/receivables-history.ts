/**
 * Historical Customer Receivables Reconstruction Engine for Zakat Accounting
 * Evaluates trade receivables (créances clients) as of historical cutoff date T.
 * Adheres strictly to transaction-level date reconstruction and double-counting prevention.
 */

import "server-only";

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/server/db/types";
import type {
  ZakatCustomerReceivablesSummary,
  ZakatCustomerReceivableItem,
  SubsystemStatus,
} from "./types";
import {
  isEffectiveOnOrBefore,
  roundMoney,
} from "./date-utils";

export interface ReconstructReceivablesOptions {
  valuationDateStr: string;
  db?: PrismaClient;
}

export async function reconstructHistoricalReceivables(
  options: ReconstructReceivablesOptions
): Promise<ZakatCustomerReceivablesSummary> {
  const { valuationDateStr, db = defaultPrisma } = options;

  // 1. Récupération de tous les clients
  const customers = await db.customer.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
    },
    orderBy: { name: "asc" },
  });

  // 2. Récupération de toutes les ventes confirmées jusqu'à la date d'évaluation
  const sales = await db.sales.findMany({
    where: {
      status: "confirmed",
    },
    select: {
      id: true,
      reference: true,
      customerId: true,
      totalAmount: true,
      saleDate: true,
      createdAt: true,
      payments: {
        where: {
          status: { not: "cancelled" },
        },
        select: {
          id: true,
          amount: true,
          method: true,
          paymentDate: true,
          createdAt: true,
        },
      },
      advanceAllocations: {
        select: {
          id: true,
          amount: true,
          allocatedAt: true,
        },
      },
    },
  });

  const customerItems: ZakatCustomerReceivableItem[] = [];
  const warnings: string[] = [];

  // Indexation des ventes par client
  const salesByCustomer = new Map<number, typeof sales>();
  const unassignedSales: typeof sales = [];

  for (const s of sales) {
    const saleEffectiveDate = s.saleDate || s.createdAt;
    if (!isEffectiveOnOrBefore(saleEffectiveDate, valuationDateStr)) {
      continue;
    }

    if (s.customerId) {
      const list = salesByCustomer.get(s.customerId) ?? [];
      list.push(s);
      salesByCustomer.set(s.customerId, list);
    } else {
      unassignedSales.push(s);
    }
  }

  // Avertissement si des ventes confirmées n'ont pas de client rattaché
  if (unassignedSales.length > 0) {
    let unassignedDebt = 0;
    for (const s of unassignedSales) {
      let paidBeforeT = 0;
      for (const p of s.payments) {
        if (isEffectiveOnOrBefore(p.paymentDate || p.createdAt, valuationDateStr)) {
          paidBeforeT += p.amount;
        }
      }
      for (const a of s.advanceAllocations) {
        if (isEffectiveOnOrBefore(a.allocatedAt, valuationDateStr)) {
          paidBeforeT += a.amount;
        }
      }
      const rem = Math.max(0, s.totalAmount - paidBeforeT);
      unassignedDebt += rem;
    }
    if (unassignedDebt > 0) {
      warnings.push(
        `Présence de ${unassignedSales.length} vente(s) confirmée(s) sans client rattaché (client comptoir/passager) avec un reste dû de ${unassignedDebt.toLocaleString("fr-DZ")} DA au ${valuationDateStr}. Ces créances anonymes nécessitent un examen.`
      );
    }
  }

  let totalReceivablesGlobal = 0;
  let customersWithDebtCount = 0;

  for (const customer of customers) {
    const cSales = salesByCustomer.get(customer.id) ?? [];
    if (cSales.length === 0) continue;

    let totalBilled = 0;
    let totalDirectPaid = 0;
    let totalSavingsUsed = 0;
    let totalAdvancesAllocated = 0;
    let totalOutstanding = 0;
    let latestSaleDateStr: string | null = null;

    for (const sale of cSales) {
      totalBilled += sale.totalAmount;

      const sDateStr = (sale.saleDate || sale.createdAt).toISOString().slice(0, 10);
      if (!latestSaleDateStr || sDateStr > latestSaleDateStr) {
        latestSaleDateStr = sDateStr;
      }

      let salePaidBeforeCutoff = 0;

      // Traitement des paiements de cette facture
      for (const p of sale.payments) {
        const pDate = p.paymentDate || p.createdAt;
        if (isEffectiveOnOrBefore(pDate, valuationDateStr)) {
          salePaidBeforeCutoff += p.amount;

          if (p.method?.toLowerCase() === "savings") {
            totalSavingsUsed += p.amount;
          } else {
            totalDirectPaid += p.amount;
          }
        }
      }

      // Traitement des affectations d'acomptes
      for (const a of sale.advanceAllocations) {
        if (isEffectiveOnOrBefore(a.allocatedAt, valuationDateStr)) {
          salePaidBeforeCutoff += a.amount;
          totalAdvancesAllocated += a.amount;
        }
      }

      const saleRemaining = Math.max(0, roundMoney(sale.totalAmount - salePaidBeforeCutoff));
      totalOutstanding += saleRemaining;
    }

    totalOutstanding = roundMoney(totalOutstanding);

    if (totalOutstanding > 0) {
      customersWithDebtCount++;
      totalReceivablesGlobal = roundMoney(totalReceivablesGlobal + totalOutstanding);

      customerItems.push({
        customerId: customer.id,
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        totalBilledDeliveries: roundMoney(totalBilled),
        totalPaymentsReceived: roundMoney(totalDirectPaid),
        totalAdvancesAllocated: roundMoney(totalAdvancesAllocated),
        totalSavingsUsed: roundMoney(totalSavingsUsed),
        outstandingBalance: totalOutstanding,
        salesCount: cSales.length,
        lastSaleDate: latestSaleDateStr,
      });
    }
  }

  // Tri décroissant par dette
  customerItems.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  const reviewNotice =
    "Règle de conformité Fiqh : L'ERP ne dispose pas de statut distinguant automatiquement les créances certaines/recouvrables (ديون مرجوة) des créances douteuses ou litigieuses (ديون ميؤوس منها). Les créances affichées représentent l'intégralité des restes dus constatés. Le gestionnaire doit impérativement examiner la solvabilité de chaque débiteur et exclure manuellement les créances douteuses de l'assiette imposable.";

  const reconstructionStatus: SubsystemStatus =
    customerItems.length > 0 || unassignedSales.length > 0 ? "REQUIRES_REVIEW" : "VERIFIED";

  return {
    reconstructionStatus,
    totalReceivablesDZD: roundMoney(totalReceivablesGlobal),
    customersWithDebtCount,
    totalCustomersEvaluated: customers.length,
    requiresManagerReview: true,
    reviewNotice,
    customers: customerItems,
    warnings,
  };
}
