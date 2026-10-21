import type { Metadata } from "next";
import { getCashDashboardData } from "../actions";
import { WithdrawalsClient } from "./WithdrawalsClient";

export const metadata: Metadata = {
  title: "Retraits de Trésorerie | Shop ERP",
  description: "Suivi et enregistrement des retraits et prélèvements de trésorerie.",
};

export const dynamic = "force-dynamic";

export default async function WithdrawalsPage() {
  const data = await getCashDashboardData();
  const withdrawals = data.ledger.filter(
    (i) => i.source === "expense" && i.category === "Fonds Propres / Prélèvement"
  );

  return (
    <div className="max-w-7xl mx-auto">
      <WithdrawalsClient
        initialWithdrawals={withdrawals}
        accounts={data.treasury.accounts}
      />
    </div>
  );
}
