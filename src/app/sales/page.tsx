import type { Metadata } from "next";
import { getSalesModuleData } from "./actions";
import { SalesClient } from "./SalesClient";

export const metadata: Metadata = {
  title: "Ventes & Facturation",
  description: "Création de factures, déduction du stock, gestion des paiements et livraisons.",
};

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const data = await getSalesModuleData();

  return <SalesClient initialData={data} />;
}
