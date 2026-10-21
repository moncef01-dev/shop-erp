import type { Metadata } from "next";
import { getCashDashboardData } from "../actions";
import { CustomerPaymentsClient } from "./CustomerPaymentsClient";

export const metadata: Metadata = {
  title: "Paiements Clients | Shop ERP",
  description: "Pointage des encaissements des ventes et factures clients.",
};

export const dynamic = "force-dynamic";

export default async function CustomerPaymentsPage() {
  const data = await getCashDashboardData();
  const customerPayments = data.ledger.filter((i) => i.source === "sale");

  return (
    <div className="max-w-7xl mx-auto">
      <CustomerPaymentsClient initialPayments={customerPayments} />
    </div>
  );
}
