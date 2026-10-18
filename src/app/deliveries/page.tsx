import type { Metadata } from "next";
import { getDeliveriesModuleData } from "./actions";
import { DeliveriesClient } from "./DeliveriesClient";

export const metadata: Metadata = {
  title: "Livraisons & Expéditions | Shop ERP",
  description: "Suivi logistique des expéditions, retraits magasin et bons de livraison conformes au Décret 05-468.",
};

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const data = await getDeliveriesModuleData();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DeliveriesClient
        deliveries={data.deliveries}
        settings={data.settings}
        metrics={data.metrics}
      />
    </div>
  );
}
