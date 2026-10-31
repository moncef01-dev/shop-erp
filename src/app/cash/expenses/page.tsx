import type { Metadata } from "next";
import { getCashDashboardData } from "../actions";
import { ExpensesClient } from "./ExpensesClient";

export const metadata: Metadata = {
  title: "Charges & Dépenses d'Exploitation | Shop ERP",
  description: "Suivi et enregistrement des frais d'exploitation du magasin.",
};

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const data = await getCashDashboardData();
  const expenses = data.ledger.filter(
    (i) =>
      i.source === "expense" &&
      i.rawCategory !== "capital" &&
      i.category !== "Fonds Propres / Prélèvement" &&
      i.category !== "Apport personnel exploitant"
  );

  return (
    <div className="max-w-7xl mx-auto">
      <ExpensesClient
        initialExpenses={expenses}
        accounts={data.treasury.accounts}
      />
    </div>
  );
}
