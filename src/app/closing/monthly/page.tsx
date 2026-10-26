import { getMonthlyClosingData } from "./actions";
import { MonthlyClosingClient } from "./MonthlyClosingClient";

export const metadata = {
  title: "Clôture Mensuelle | Shop ERP",
  description: "Pointage, consolidation financière et inventaire de fin de mois",
};

interface PageProps {
  searchParams?: Promise<{ month?: string }> | { month?: string };
}

export default async function MonthlyClosingPage(props: PageProps) {
  const resolvedSearchParams = await props.searchParams;
  const month = resolvedSearchParams?.month;

  const data = await getMonthlyClosingData(month);

  return <MonthlyClosingClient initialData={data} />;
}
