import { getAllSuppliersWithDebts } from "./actions";
import { getTreasuryDashboardData } from "@/app/cash/treasury-actions";
import { SuppliersClient } from "./SuppliersClient";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { suppliers, metrics } = await getAllSuppliersWithDebts();
  const { accounts } = await getTreasuryDashboardData();

  return (
    <div className="p-6">
      <SuppliersClient
        initialSuppliers={suppliers}
        initialMetrics={metrics}
        treasuryAccounts={accounts}
      />
    </div>
  );
}
