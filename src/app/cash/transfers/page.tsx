import type { Metadata } from "next";
import { getTreasuryDashboardData } from "../treasury-actions";
import { TransfersClient } from "./TransfersClient";

export const metadata: Metadata = {
  title: "Mouvements & Virements Inter-Comptes | Shop ERP",
  description: "Transferts internes de fonds entre caisses, coffres et banques.",
};

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const { accounts, transfers } = await getTreasuryDashboardData();

  return (
    <div className="max-w-7xl mx-auto">
      <TransfersClient initialTransfers={transfers} accounts={accounts} />
    </div>
  );
}
