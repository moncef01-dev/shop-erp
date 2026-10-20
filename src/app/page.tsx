import type { Metadata } from "next";
import { getDashboardData } from "./dashboard-actions";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Tableau de bord",
  description: "Aperçu opérationnel en temps réel de votre magasin de meubles — ventes, trésorerie, caisse, créances et stocks.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialData = await getDashboardData({ preset: "month" });

  return <DashboardClient initialData={initialData} />;
}
