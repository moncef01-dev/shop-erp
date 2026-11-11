import { getZakatDashboardDataAction } from "./actions";
import { ZakatDashboardClient } from "./ZakatDashboardClient";

export const metadata = {
  title: "Comptabilité de la Zakat | Shop ERP",
  description: "Évaluation de la Zakat sur les biens de commerce (Zakāt ‘Urūd al-Tijārah)",
};

export const dynamic = "force-dynamic";

export default async function ZakatPage() {
  const data = await getZakatDashboardDataAction();

  return <ZakatDashboardClient initialData={data} />;
}

