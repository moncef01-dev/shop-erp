import { getAllSuppliersWithDebts } from "./actions";
import { getTreasuryDashboardData } from "@/app/cash/treasury-actions";
import { prisma } from "@/server/db";
import { SuppliersClient } from "./SuppliersClient";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { suppliers, metrics } = await getAllSuppliersWithDebts();
  const { accounts } = await getTreasuryDashboardData();
  const activeSession = await prisma.cashSession.findFirst({
    where: { status: "open" },
    select: { id: true, reference: true, status: true },
  });

  return (
    <div className="p-6">
      <SuppliersClient
        initialSuppliers={suppliers}
        initialMetrics={metrics}
        treasuryAccounts={accounts}
        activeCashSession={activeSession}
      />
    </div>
  );
}
