import { prisma } from "@/server/db";

export async function fetchDashboardOverview(
  start: Date,
  end: Date,
  prevStart: Date,
  prevEnd: Date
) {
  return Promise.all([
    // Ventes confirmées de la période
    prisma.sales.findMany({
      where: {
        status: "confirmed",
        saleDate: { gte: start, lte: end },
      },
      include: {
        customer: { select: { name: true } },
      },
      orderBy: { saleDate: "desc" },
    }),

    // Ventes période précédente
    prisma.sales.findMany({
      where: {
        status: "confirmed",
        saleDate: { gte: prevStart, lte: prevEnd },
      },
      select: { totalAmount: true },
    }),

    // Règlements encaissés période courante
    prisma.payment.findMany({
      where: {
        status: "completed",
        paymentDate: { gte: start, lte: end },
      },
      include: {
        sale: {
          select: {
            reference: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { paymentDate: "desc" },
    }),

    // Règlements période précédente
    prisma.payment.findMany({
      where: {
        status: "completed",
        paymentDate: { gte: prevStart, lte: prevEnd },
      },
      select: { amount: true, saleId: true, purchaseId: true },
    }),

    // Dépenses période courante
    prisma.expense.findMany({
      where: {
        date: { gte: start, lte: end },
        status: { not: "cancelled" },
      },
      orderBy: { date: "desc" },
    }),

    // Dépenses période précédente
    prisma.expense.findMany({
      where: {
        date: { gte: prevStart, lte: prevEnd },
        status: { not: "cancelled" },
      },
      select: { amount: true, type: true },
    }),

    // Créances : factures non annulées avec solde dû
    prisma.sales.findMany({
      where: {
        status: { not: "cancelled" },
        paymentStatus: { in: ["unpaid", "partial"] },
      },
      select: {
        id: true,
        reference: true,
        totalAmount: true,
        paidAmount: true,
        customer: { select: { name: true } },
      },
    }),

    // Session active
    prisma.cashSession.findFirst({
      where: { status: "open" },
    }),

    // Dernière session fermée
    prisma.cashSession.findFirst({
      where: { status: "closed" },
      orderBy: { closedAt: "desc" },
    }),

    // Produits & catalogue
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        stock: true,
        minStock: true,
        unit: true,
      },
    }),

    // Achats récents
    prisma.purchase.findMany({
      where: { status: { not: "cancelled" } },
      take: 5,
      orderBy: { purchaseDate: "desc" },
      include: {
        supplier: { select: { name: true } },
      },
    }),

    // Annulations récentes
    prisma.sales.findMany({
      where: {
        status: "cancelled",
        updatedAt: { gte: start, lte: end },
      },
      select: { id: true, reference: true, totalAmount: true },
      take: 5,
    }),
  ]);
}

export async function findDefaultTreasuryAccount() {
  return (
    (await prisma.treasuryAccount.findFirst({ where: { isDefault: true, isActive: true } })) ||
    (await prisma.treasuryAccount.findFirst({ where: { type: "cash", isActive: true } }))
  );
}

export function findSessionCashPayments(
  sessionId: number,
  accountId: number | undefined,
  openedAt: Date,
  now: Date
) {
  return prisma.payment.findMany({
    where: {
      status: { not: "cancelled" },
      method: "cash",
      AND: [
        { OR: [{ accountId }, { accountId: null }] },
        {
          OR: [
            { sessionId },
            { sessionId: null, paymentDate: { gte: openedAt, lte: now } },
          ],
        },
      ],
    },
    select: { amount: true, saleId: true, purchaseId: true },
  });
}

export function findSessionCashExpenses(
  sessionId: number,
  accountId: number | undefined,
  openedAt: Date,
  now: Date
) {
  return prisma.expense.findMany({
    where: {
      method: "cash",
      status: { not: "cancelled" },
      AND: [
        { OR: [{ accountId }, { accountId: null }] },
        {
          OR: [
            { sessionId },
            { sessionId: null, date: { gte: openedAt, lte: now } },
          ],
        },
      ],
    },
    select: { amount: true, type: true },
  });
}
