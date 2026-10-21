import type { Metadata } from "next";
import { getTreasuryDashboardData } from "../treasury-actions";
import { AccountsClient } from "./AccountsClient";

export const metadata: Metadata = {
  title: "Comptes de Trésorerie | Shop ERP",
  description: "Gestion des comptes de caisse, coffres et banques.",
};

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const { accounts } = await getTreasuryDashboardData();

  return (
    <div className="max-w-7xl mx-auto">
      <AccountsClient initialAccounts={accounts} />
    </div>
  );
}
