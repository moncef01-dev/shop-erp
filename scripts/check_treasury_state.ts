import { prisma } from "../src/lib/prisma";
import { calculateAccountBalance, getAccountMovements } from "../src/app/cash/treasury-actions";
import { calculateSupplierDebt } from "../src/app/suppliers/actions";

async function main() {
  console.log("=================================================");
  console.log("           CURRENT TREASURY AUDIT");
  console.log("=================================================");

  const accounts = await prisma.treasuryAccount.findMany({ orderBy: { id: "asc" } });
  for (const acc of accounts) {
    const bal = await calculateAccountBalance(acc.id);
    const mov = await getAccountMovements(acc.id);
    console.log(`\nAccount #${acc.id}: "${acc.name}" (${acc.code})`);
    console.log(`  Opening Balance: ${acc.openingBalance} DA`);
    console.log(`  Current Balance: ${bal} DA`);
    console.log(`  Movements Count: ${mov.movements.length}`);
    for (const m of mov.movements) {
      console.log(`    - [${m.date.split("T")[0]}] ${m.type} (${m.reference}): in=${m.inflow}, out=${m.outflow}, runBal=${m.runningBalance} DA | ${m.description}`);
    }
  }

  console.log("\n=================================================");
  console.log("           CURRENT SUPPLIERS AUDIT");
  console.log("=================================================");
  const suppliers = await prisma.supplier.findMany({ orderBy: { id: "asc" } });
  for (const supp of suppliers) {
    const debt = await calculateSupplierDebt(supp.id);
    console.log(`\nSupplier #${supp.id}: "${supp.name}" (${supp.code})`);
    console.log(`  Initial Debt: ${debt.initialDebt} DA`);
    console.log(`  Total Purchases: ${debt.totalPurchases} DA`);
    console.log(`  Total Paid: ${debt.totalPaid} DA`);
    console.log(`  Outstanding Debt: ${debt.outstandingDebt} DA`);
  }

  console.log("\n=================================================");
  console.log("       DETAILED TAYEB GIDOUM CHECK");
  console.log("=================================================");
  const allDebts = await prisma.supplierDebt.findMany();
  console.log("All supplier debts in db:", allDebts);

  const allPurchases = await prisma.purchase.findMany({ include: { supplier: true } });
  console.log("All purchases in db:", allPurchases.map(p => ({ id: p.id, ref: p.reference, supplier: p.supplier?.name, total: p.totalAmount, paid: p.paidAmount })));

  const allSupplierPayments = await prisma.payment.findMany({ where: { supplierId: { not: null } } });
  console.log("All supplier payments in db:", allSupplierPayments);

  console.log("\n=================================================");
  console.log("            CASH SESSIONS AUDIT");
  console.log("=================================================");
  const sessions = await prisma.cashSession.findMany({ orderBy: { id: "desc" }, include: { transfers: true } });
  for (const s of sessions) {
    console.log(`Session #${s.id} (${s.reference}): status=${s.status}, openedAt=${s.openedAt?.toISOString()}, closedAt=${s.closedAt?.toISOString()}`);
    console.log(`  openingAmount=${s.openingAmount}, theoreticalAmount=${s.theoreticalAmount}, closingAmount=${s.closingAmount}, originalClosingAmount=${s.originalClosingAmount}, retainedAmount=${s.retainedAmount}`);
  }

  const s3 = sessions.find(s => s.reference === 'CS-202610-0003');
  if (s3 && s3.closedAt) {
    const afterExpenses = await prisma.expense.findMany({ where: { date: { gt: s3.closedAt } } });
    const afterPayments = await prisma.payment.findMany({ where: { paymentDate: { gt: s3.closedAt } } });
    console.log("Expenses after CS-202610-0003 closedAt:", afterExpenses);
    console.log("Payments after CS-202610-0003 closedAt:", afterPayments);
  }
  const unlinkedExpenses = await prisma.expense.findMany({ where: { sessionId: null } });
  console.log("Unlinked expenses count:", unlinkedExpenses.length);
  for (const ue of unlinkedExpenses) {
    console.log(`  - #${ue.id} ${ue.reference} amt=${ue.amount} cat=${ue.category} desc="${ue.description}" date=${ue.date.toISOString()}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
