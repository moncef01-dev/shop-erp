import { prisma, type DbClient } from "@/server/db";

export async function generateNextCustomerCode(db: DbClient = prisma): Promise<string> {
  const lastCustomer = await db.customer.findFirst({
    where: { code: { startsWith: "CLI-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  let nextSeq = 1;
  if (lastCustomer?.code) {
    const parts = lastCustomer.code.split("-");
    const num = parseInt(parts[1], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }
  return `CLI-${String(nextSeq).padStart(4, "0")}`;
}

export function findCustomersWithSales(searchQuery?: string) {
  const query = searchQuery?.trim();

  const whereClause = query
    ? {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
          { phone2: { contains: query } },
          { code: { contains: query } },
          { address: { contains: query } },
        ],
      }
    : {};

  return prisma.customer.findMany({
    where: whereClause,
    include: {
      sales: {
        where: { status: { not: "cancelled" } },
        select: {
          id: true,
          reference: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          paymentStatus: true,
          saleDate: true,
        },
        orderBy: { saleDate: "desc" },
      },
      _count: {
        select: { sales: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function findCustomerByPhone(phone: string, excludeId?: number, db: DbClient = prisma) {
  return db.customer.findFirst({
    where: {
      phone: { equals: phone },
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });
}

export function findCustomerById(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({ where: { id } });
}

export function findCustomerWithSalesCount(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({
    where: { id },
    include: {
      _count: {
        select: { sales: true },
      },
    },
  });
}

export function createCustomer(
  data: {
    code: string;
    name: string;
    phone: string | null;
    phone2: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    isActive: boolean;
  },
  db: DbClient = prisma
) {
  return db.customer.create({ data });
}

export function updateCustomer(
  id: number,
  data: {
    name?: string;
    phone?: string | null;
    phone2?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
  db: DbClient = prisma
) {
  return db.customer.update({ where: { id }, data });
}

export function deleteCustomer(id: number, db: DbClient = prisma) {
  return db.customer.delete({ where: { id } });
}

export function findCustomerDetailsById(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({
    where: { id },
    include: {
      sales: {
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, model: true, color: true },
              },
              location: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          payments: {
            orderBy: { paymentDate: "desc" },
          },
        },
        orderBy: { saleDate: "desc" },
      },
    },
  });
}
