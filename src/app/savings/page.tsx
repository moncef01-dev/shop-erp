import type { Metadata } from "next";
import { getSavingsOverviewData } from "./actions";
import { SavingsClient } from "./SavingsClient";

export const metadata: Metadata = {
  title: "Épargne Client & Avoirs | Shop ERP",
  description: "Gestion des comptes d'épargne, dépôts sans facture, utilisation sur ventes et remboursements clients.",
};

export const dynamic = "force-dynamic";

export default async function SavingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ customerId?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialCustomerId = params?.customerId ? parseInt(params.customerId, 10) : undefined;
  const initialData = await getSavingsOverviewData();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <SavingsClient
        initialData={initialData}
        initialCustomerId={!isNaN(initialCustomerId as number) ? initialCustomerId : undefined}
      />
    </div>
  );
}

