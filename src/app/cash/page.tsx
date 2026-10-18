import type { Metadata } from "next";
import { getCashDashboardData } from "./actions";
import { CashClient } from "./CashClient";

export const metadata: Metadata = {
  title: "Caisse & Trésorerie | Shop ERP Mobilier",
  description: "Gestion du tiroir-caisse physique, pointages, dépenses et suivi de la trésorerie.",
};

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const data = await getCashDashboardData();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <CashClient initialData={data} />
    </div>
  );
}
