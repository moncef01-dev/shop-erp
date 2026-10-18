import type { Metadata } from "next";
import { getCustomersData } from "./actions";
import { CustomersClient } from "./CustomersClient";

export const metadata: Metadata = {
  title: "Clients",
  description: "Répertoire clients, historique des achats et suivi des créances.",
};

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await getCustomersData();

  return <CustomersClient initialCustomers={customers} />;
}
