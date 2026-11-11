import { getAllSuppliersWithDebts } from "./actions";
import { getTreasuryDashboardData } from "@/app/cash/treasury-actions";
import { findOpenCashSessionLite } from "@/server/repositories/cash.repository";
import { SuppliersClient } from "./SuppliersClient";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { suppliers, metrics } = await getAllSuppliersWithDebts();
  const { accounts } = await getTreasuryDashboardData();
  const activeSession = await findOpenCashSessionLite();

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
