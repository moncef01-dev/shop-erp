import { prisma, type DbClient, type TxClient } from "@/server/db";

// ─── GÉNÉRATEURS DE RÉFÉRENCES (FAC-/DEV-/PAY-) ──────────────────────────────

export async function generateNextInvoiceNumber(tx: TxClient, isDraft: boolean): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = isDraft ? `DEV-${yearMonth}-` : `FAC-${yearMonth}-`;

  const lastSale = await tx.sales.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastSale?.reference) {
    const parts = lastSale.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function generateNextSalePaymentReference(tx: TxClient): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PAY-${yearMonth}-`;

  const lastPayment = await tx.payment.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  let nextSeq = 1;
  if (lastPayment?.reference) {
    const parts = lastPayment.reference.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// ─── DONNÉES DU MODULE VENTES ────────────────────────────────────────────────

export async function fetchSalesCatalog() {
  return Promise.all([
    prisma.sales.findMany({
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                model: true,
                color: true,
                sellingPrice: true,
              },
            },
            location: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            session: {
              select: { id: true, reference: true, status: true },
            },
          },
        },
        movements: true,
      },
      orderBy: { saleDate: "desc" },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      include: {
        categoryRef: true,
        stocks: {
          include: {
            location: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  ]);
}

export async function fetchSalesModuleMeta() {
  return Promise.all([
    prisma.shopSettings.findUnique({ where: { id: 1 } }),
    prisma.cashSession.findFirst({
      where: { status: "open" },
      select: { id: true, reference: true },
    }),
    prisma.customerSavingsAccount.findMany({
      select: { customerId: true, balance: true },
    }),
  ]);
}

// ─── AVANCES CLIENTS ─────────────────────────────────────────────────────────

export async function generateNextAdvanceReference(): Promise<string> {
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

export function fetchCustomerAdvancesWithStats() {
  return prisma.customerAdvance.findMany({
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
}

export function findCustomerAdvanceById(advanceId: number, db: DbClient = prisma) {
  return db.customerAdvance.findUnique({
    where: { id: advanceId },
    include: { customer: true },
  });
}

export function fetchAdvancesForPage(db: DbClient = prisma) {
  return db.customerAdvance.findMany({
    orderBy: { paymentDate: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      account: { select: { id: true, name: true, code: true } },
    },
  });
}

export function createCustomerAdvanceRecord(
  tx: TxClient,
  data: {
    reference: string;
    customerId: number;
    amount: number;
    allocatedAmount: number;
    refundedAmount: number;
    method: string;
    paymentDate: Date;
    productInterest: string | null;
    notes: string | null;
    status: string;
    sessionId: number | null;
  }
) {
  return tx.customerAdvance.create({
    data,
    include: {
      customer: true,
    },
  });
}

export function updateCustomerAdvanceRecord(
  tx: TxClient,
  id: number,
  data: {
    allocatedAmount?: number;
    refundedAmount?: number;
    status?: string;
    notes?: string;
  }
) {
  return tx.customerAdvance.update({ where: { id }, data });
}

export function createAdvanceAllocationRecord(
  tx: TxClient,
  data: { advanceId: number; saleId: number; amount: number; notes: string | null }
) {
  return tx.customerAdvanceAllocation.create({ data });
}

// ─── LECTURES VENTES ─────────────────────────────────────────────────────────

export function findSaleWithItemsAndCustomer(saleId: number, db: DbClient = prisma) {
  return db.sales.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      items: true,
    },
  });
}

export function findSaleWithCustomer(saleId: number, db: DbClient = prisma) {
  return db.sales.findUnique({
    where: { id: saleId },
    include: { customer: true },
  });
}

export function findSaleForCancel(saleId: number, db: DbClient = prisma) {
  return db.sales.findUnique({
    where: { id: saleId },
    include: {
      items: true,
      payments: { include: { session: true } },
      customer: true,
    },
  });
}

export function findSaleForPrint(saleId: number, db: DbClient = prisma) {
  return db.sales.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              model: true,
              color: true,
              sellingPrice: true,
            },
          },
          location: {
            select: { id: true, code: true, name: true },
          },
        },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
  });
}

export function findSaleFullForResponse(tx: TxClient, saleId: number) {
  return tx.sales.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              model: true,
              color: true,
              sellingPrice: true,
            },
          },
          location: {
            select: { id: true, code: true, name: true },
          },
        },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
  });
}

export function findExistingSaleForUpdate(tx: TxClient, saleId: number) {
  return tx.sales.findUnique({
    where: { id: saleId },
    include: {
      customer: true,
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, costPrice: true } },
          location: { select: { id: true, name: true } },
        },
      },
      payments: {
        where: { status: { not: "cancelled" } },
        include: {
          session: {
            select: { id: true, reference: true, status: true },
          },
        },
        orderBy: { paymentDate: "desc" },
      },
      advanceAllocations: true,
    },
  });
}

export function findCurrentSaleForPayment(tx: TxClient, saleId: number) {
  return tx.sales.findUnique({
    where: { id: saleId },
    select: { id: true, reference: true, totalAmount: true, paidAmount: true, status: true, customerId: true },
  });
}

export function findCustomerNameById(tx: TxClient, customerId: number) {
  return tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
}

// ─── ÉCRITURES VENTES ────────────────────────────────────────────────────────

export function createSaleRecord(
  tx: TxClient,
  data: {
    reference: string;
    customerId: number | null;
    status: string;
    subtotal: number;
    discount: number;
    deliveryFee: number;
    includeDeliveryFee: boolean;
    totalAmount: number;
    paidAmount: number;
    paymentStatus: string;
    deliveryStatus: string;
    notes: string | null;
    saleDate: Date;
  }
) {
  return tx.sales.create({ data });
}

export function createSaleItemRecord(
  tx: TxClient,
  data: {
    saleId: number;
    productId: number;
    locationId: number;
    color: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
  }
) {
  return tx.saleItem.create({ data });
}

export function createSaleItemsBatch(
  tx: TxClient,
  data: Array<{
    saleId: number;
    productId: number;
    locationId: number;
    color: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
  }>
) {
  return tx.saleItem.createMany({ data });
}

export function deleteSaleItems(tx: TxClient, saleId: number) {
  return tx.saleItem.deleteMany({ where: { saleId } });
}

export function createSalePaymentRecord(
  tx: TxClient,
  data: {
    reference: string;
    saleId: number;
    accountId: number | null;
    amount: number;
    method: string;
    status: string;
    notes: string;
    paymentDate: Date;
    sessionId: number | null;
  }
) {
  return tx.payment.create({ data });
}

export function updatePaymentRecord(
  tx: TxClient,
  id: number,
  data: { amount?: number; status?: string; notes?: string }
) {
  return tx.payment.update({ where: { id }, data });
}

export function updateSaleRecord(
  tx: TxClient,
  id: number,
  data: Record<string, unknown>,
  include?: object
) {
  return tx.sales.update({
    where: { id },
    data,
    ...(include ? { include } : {}),
  });
}

// ─── SUPPORT STOCK POUR LA RÉCONCILIATION (MODIFICATION DE FACTURE) ──────────

export function preloadStockCaches(
  tx: TxClient,
  productIds: number[],
  locationIds: number[],
  withStocks: boolean
) {
  return Promise.all([
    tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, costPrice: true, isActive: true },
    }),
    tx.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true, code: true, isActive: true },
    }),
    withStocks
      ? tx.productStock.findMany({
          where: {
            productId: { in: productIds },
            locationId: { in: locationIds },
          },
        })
      : Promise.resolve([]),
  ]);
}

export async function recomputeProductTotals(tx: TxClient, productIds: number[]) {
  for (const prodId of productIds) {
    const allStocks = await tx.productStock.findMany({
      where: { productId: prodId },
      select: { quantity: true },
    });
    const newTotal = allStocks.reduce((sum, s) => sum + s.quantity, 0);
    await tx.product.update({
      where: { id: prodId },
      data: { stock: newTotal },
    });
  }
}
