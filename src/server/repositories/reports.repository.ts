import { prisma } from "@/server/db";

export async function fetchReportsOverview(start: Date, end: Date) {
  return Promise.all([
    // Ventes confirmées dans la période
    prisma.sales.findMany({
      where: {
        status: "confirmed",
        saleDate: { gte: start, lte: end },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, costPrice: true } },
          },
        },
        payments: true,
      },
    }),

    // Achats fournisseurs dans la période
    prisma.purchase.findMany({
      where: {
        status: { not: "cancelled" },
        purchaseDate: { gte: start, lte: end },
      },
      include: {
        payments: true,
      },
    }),

    // Dépenses dans la période
    prisma.expense.findMany({
      where: {
        date: { gte: start, lte: end },
        status: { not: "cancelled" },
      },
    }),

    // Paiements dans la période
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: start, lte: end },
        status: "completed",
      },
    }),

    // Produits et stocks actuels
    prisma.product.findMany({
      include: {
        categoryRef: { select: { name: true } },
        stocks: {
          include: {
            location: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),

    // Emplacements / Dépôts
    prisma.location.findMany({
      where: { isActive: true },
    }),
  ]);
}
