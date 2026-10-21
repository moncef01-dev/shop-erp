import type { Metadata } from "next";
import { getCashDashboardData } from "../actions";
import { getAllSuppliersWithDebts } from "@/app/suppliers/actions";
import { SupplierPaymentsClient } from "./SupplierPaymentsClient";

export const metadata: Metadata = {
  title: "Paiement Fournisseurs | Shop ERP",
  description: "Règlements des dettes fournisseurs depuis la trésorerie.",
};

export const dynamic = "force-dynamic";

export default async function SupplierPaymentsPage() {
  const [cashData, suppliersData] = await Promise.all([
    getCashDashboardData(),
    getAllSuppliersWithDebts(),
  ]);

  const supplierPayments = cashData.ledger.filter((i) => i.source === "purchase");

  return (
    <div className="max-w-7xl mx-auto">
      <SupplierPaymentsClient
        initialPayments={supplierPayments}
        suppliers={suppliersData.suppliers}
        accounts={cashData.treasury.accounts}
      />
    </div>
  );
}
