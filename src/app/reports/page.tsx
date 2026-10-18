import type { Metadata } from "next";
import { getReportsData } from "./actions";
import { ReportsClient } from "./ReportsClient";

export const metadata: Metadata = {
  title: "Rapports & Statistiques — Shop ERP",
  description: "Bilans de ventes, créances, dettes, trésorerie et valorisation des stocks",
};

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const initialData = await getReportsData({ preset: "month" });
  return <ReportsClient initialData={initialData} />;
}
