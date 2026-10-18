import type { Metadata } from "next";
import { getPurchasesData } from "./actions";
import { PurchasesClient } from "./PurchasesClient";

export const metadata: Metadata = {
  title: "Achats & Fournisseurs",
  description: "Gestion des commandes fournisseurs, réceptions de stock et règlements des dettes.",
};

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const data = await getPurchasesData();

  return <PurchasesClient initialData={data} />;
}

