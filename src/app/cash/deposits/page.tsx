import type { Metadata } from "next";
import { getCashDashboardData } from "../actions";
import { DepositsClient } from "./DepositsClient";

export const metadata: Metadata = {
  title: "Apports de Trésorerie | Shop ERP",
  description: "Gestion des apports de trésorerie, capital et fonds propres.",
};

export const dynamic = "force-dynamic";

export default async function DepositsPage() {
  const data = await getCashDashboardData();
  const deposits = data.ledger.filter((i) => i.source === "income");

  return (
    <div className="max-w-7xl mx-auto">
      <DepositsClient
        initialDeposits={deposits}
        accounts={data.treasury.accounts}
      />
    </div>
  );
}
