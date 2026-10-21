import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AdvancesClient, type AdvanceItem } from "./AdvancesClient";

export const metadata: Metadata = {
  title: "Acomptes & Avances Clients | Shop ERP",
  description: "Suivi des acomptes reçus des clients avant affectation.",
};

export const dynamic = "force-dynamic";

export default async function AdvancesPage() {
  const rawAdvances = await prisma.customerAdvance.findMany({
    orderBy: { paymentDate: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      account: { select: { id: true, name: true, code: true } },
    },
  });

  const advances: AdvanceItem[] = rawAdvances.map((a) => {
    const available = Math.max(0, a.amount - a.allocatedAmount - a.refundedAmount);
    return {
      id: a.id,
      reference: a.reference,
      customerId: a.customerId,
      customerName: a.customer?.name || "Client comptoir",
      customerPhone: a.customer?.phone,
      accountId: a.accountId,
      accountName: a.account?.name || null,
      amount: a.amount,
      allocatedAmount: a.allocatedAmount,
      refundedAmount: a.refundedAmount,
      availableAmount: available,
      method: a.method,
      paymentDate: a.paymentDate.toISOString(),
      productInterest: a.productInterest,
      notes: a.notes,
      status: a.status,
    };
  });

  return (
    <div className="max-w-7xl mx-auto">
      <AdvancesClient initialAdvances={advances} />
    </div>
  );
}
