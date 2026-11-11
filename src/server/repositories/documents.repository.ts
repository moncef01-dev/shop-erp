import { prisma, type DbClient } from "@/server/db";

export async function fetchDocumentsOverview() {
  return Promise.all([
    // 1. Ventes (Factures et Devis)
    prisma.sales.findMany({
      orderBy: { saleDate: "desc" },
      include: {
        customer: true,
        items: {
          include: {
            product: { select: { sku: true, name: true, model: true, color: true } },
            location: { select: { name: true } },
          },
        },
        payments: true,
      },
    }),

    // 2. Commandes Fournisseurs
    prisma.purchase.findMany({
      orderBy: { purchaseDate: "desc" },
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { sku: true, name: true, model: true, color: true, costPrice: true } },
            location: { select: { name: true, code: true } },
          },
        },
        receipts: {
          include: {
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true } },
                location: { select: { id: true, name: true, code: true } },
                purchaseItem: { select: { id: true, quantity: true, unitCost: true } },
              },
            },
          },
        },
        payments: true,
      },
    }),

    // 4. Bons de Réception Marchandises
    prisma.purchaseReceipt.findMany({
      orderBy: { receiptDate: "desc" },
      include: {
        purchase: {
          include: {
            supplier: true,
          },
        },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true } },
            location: { select: { id: true, name: true, code: true } },
            purchaseItem: { select: { id: true, quantity: true, unitCost: true } },
          },
        },
      },
    }),

    // 5. Règlements (Clients et Fournisseurs)
    prisma.payment.findMany({
      orderBy: { paymentDate: "desc" },
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
        account: true,
      },
    }),

    // 6. Sessions de Caisse
    prisma.cashSession.findMany({
      orderBy: { openedAt: "desc" },
      include: {
        expenses: true,
        payments: true,
      },
    }),

    // 7. Dépenses de Caisse
    prisma.expense.findMany({
      where: { status: { not: "cancelled" } },
      orderBy: { date: "desc" },
    }),

    // 8. Transferts de Stock inter-dépôts
    prisma.stockMovement.findMany({
      where: { type: "TRANSFER" },
      orderBy: { date: "desc" },
      include: {
        product: { select: { sku: true, name: true, model: true, color: true } },
        fromLocation: true,
        toLocation: true,
      },
    }),

    // Emplacements
    prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
}

export function findSaleDocumentById(id: number, db: DbClient = prisma) {
  return db.sales.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: { select: { sku: true, name: true, model: true, color: true } },
          location: { select: { name: true } },
        },
      },
      payments: true,
    },
  });
}

export function findPurchaseDocumentById(id: number, db: DbClient = prisma) {
  return db.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        include: {
          product: { select: { sku: true, name: true, model: true, color: true, costPrice: true } },
          location: { select: { name: true, code: true } },
        },
      },
      receipts: {
        include: {
          items: {
            include: {
              product: { select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true } },
              location: { select: { id: true, name: true, code: true } },
              purchaseItem: { select: { id: true, quantity: true, unitCost: true } },
            },
          },
        },
      },
      payments: true,
    },
  });
}

export function findPurchaseReceiptDocumentById(id: number, db: DbClient = prisma) {
  return db.purchaseReceipt.findUnique({
    where: { id },
    include: {
      purchase: { include: { supplier: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true } },
          location: { select: { id: true, name: true, code: true } },
          purchaseItem: { select: { id: true, quantity: true, unitCost: true } },
        },
      },
    },
  });
}

export function findPaymentDocumentById(id: number, db: DbClient = prisma) {
  return db.payment.findUnique({
    where: { id },
    include: {
      sale: { include: { customer: true } },
      purchase: { include: { supplier: true } },
      supplier: true,
      account: true,
    },
  });
}

export function findCashSessionDocumentById(id: number, db: DbClient = prisma) {
  return db.cashSession.findUnique({ where: { id } });
}

export function findExpenseDocumentById(id: number, db: DbClient = prisma) {
  return db.expense.findUnique({ where: { id } });
}

export function findTransferDocumentById(id: number, db: DbClient = prisma) {
  return db.stockMovement.findUnique({
    where: { id },
    include: {
      product: { select: { sku: true, name: true, model: true, color: true } },
      fromLocation: true,
      toLocation: true,
    },
  });
}

export async function fetchInventorySheetData() {
  return Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        categoryRef: { select: { name: true } },
        stocks: {
          select: { locationId: true, quantity: true },
        },
      },
    }),
  ]);
}

export function findCustomerById(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({ where: { id } });
}

export function findSalesForCustomerStatement(
  customerId: number,
  startDate?: string,
  endDate?: string,
  db: DbClient = prisma
) {
  return db.sales.findMany({
    where: {
      customerId,
      status: { in: ["confirmed", "draft"] },
      ...(startDate ? { saleDate: { gte: new Date(startDate) } } : {}),
      ...(endDate ? { saleDate: { lte: new Date(endDate) } } : {}),
    },
    orderBy: { saleDate: "asc" },
    include: {
      payments: true,
    },
  });
}

export function findSupplierById(id: number, db: DbClient = prisma) {
  return db.supplier.findUnique({ where: { id } });
}

export function findPurchasesForSupplierStatement(
  supplierId: number,
  startDate?: string,
  endDate?: string,
  db: DbClient = prisma
) {
  return db.purchase.findMany({
    where: {
      supplierId,
      status: { not: "cancelled" },
      ...(startDate ? { purchaseDate: { gte: new Date(startDate) } } : {}),
      ...(endDate ? { purchaseDate: { lte: new Date(endDate) } } : {}),
    },
    orderBy: { purchaseDate: "asc" },
    include: {
      payments: true,
    },
  });
}

export async function fetchPartiesForStatement() {
  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { customers, suppliers };
}
