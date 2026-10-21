import { prisma } from "../src/lib/prisma";
import { calculateAccountBalance, getTreasuryDashboardData } from "../src/app/cash/treasury-actions";
import { getCashDashboardData } from "../src/app/cash/actions";

export async function verifyReconciliation() {
  const sale = await prisma.sales.findUnique({
    where: { id: 27 },
    include: { customer: true, payments: true },
  });

  const customerSales = await prisma.sales.findMany({
    where: { customerId: sale?.customerId, status: { not: "cancelled" } },
  });
  const customerTotal = customerSales.reduce((acc: number, s: { totalAmount: number }) => acc + s.totalAmount, 0);
  const customerPaid = customerSales.reduce((acc: number, s: { paidAmount: number }) => acc + s.paidAmount, 0);

  const payment = await prisma.payment.findUnique({ where: { id: 31 } });
  const caisseBal = await calculateAccountBalance(1);
  const coffreBal = await calculateAccountBalance(2);
  const cashData = await getCashDashboardData();
  const treasuryData = await getTreasuryDashboardData();

  return {
    sale,
    customerTotal,
    customerPaid,
    payment,
    caisseBal,
    coffreBal,
    cashData,
    treasuryData,
  };
}
