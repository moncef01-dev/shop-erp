import type { Metadata } from "next";
import { getCashDashboardData } from "./actions";
import { GlobalSituationClient } from "./GlobalSituationClient";

export const metadata: Metadata = {
  title: "Situation Financière Globale | Shop ERP",
  description: "Vue d'ensemble consolidée de la trésorerie : caisses, coffres et banques.",
};

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const data = await getCashDashboardData();

  return (
    <div className="max-w-7xl mx-auto">
      <GlobalSituationClient data={data} />
    </div>
  );
}
